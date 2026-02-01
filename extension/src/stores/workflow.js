import { defineStore } from 'pinia';
import { nanoid } from 'nanoid';
import defu from 'defu';
import deepmerge from 'lodash.merge';
import browser from 'webextension-polyfill';
import dayjs from 'dayjs';
import { fetchApi } from '@/utils/api';
import { tasks } from '@/utils/shared';
import firstWorkflows from '@/utils/firstWorkflows';
import {
  cleanWorkflowTriggers,
  registerWorkflowTrigger,
} from '@/utils/workflowTrigger';
import { useUserStore } from './user';

const defaultWorkflow = (data = null, options = {}) => {
  let workflowData = {
    id: nanoid(),
    name: '',
    icon: 'riGlobalLine',
    folderId: null,
    content: null,
    connectedTable: null,
    drawflow: {
      edges: [],
      zoom: 1.3,
      nodes: [
        {
          position: {
            x: 100,
            y: window.innerHeight / 2,
          },
          id: nanoid(),
          label: 'trigger',
          data: tasks.trigger.data,
          type: tasks.trigger.component,
        },
      ],
    },
    table: [],
    dataColumns: [],
    description: '',
    trigger: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isDisabled: false,
    settings: {
      publicId: '',
      blockDelay: 0,
      saveLog: true,
      debugMode: false,
      restartTimes: 3,
      notification: true,
      execContext: 'popup',
      reuseLastState: false,
      inputAutocomplete: true,
      onError: 'stop-workflow',
      executedBlockOnWeb: false,
      insertDefaultColumn: false,
      defaultColumnName: 'column',
    },
    version: browser.runtime.getManifest().version,
    globalData: '{\n\t"key": "value"\n}',
  };

  if (data) {
    if (options.duplicateId && data.id) {
      delete workflowData.id;
    }

    if (data.drawflow?.nodes?.length > 0) {
      workflowData.drawflow.nodes = [];
    }

    workflowData = defu(data, workflowData);
  }

  return workflowData;
};

function convertWorkflowsToObject(workflows) {
  if (Array.isArray(workflows)) {
    return workflows.reduce((acc, workflow) => {
      acc[workflow.id] = workflow;

      return acc;
    }, {});
  }

  return workflows;
}

export const useWorkflowStore = defineStore('workflow', {
  storageMap: {
    workflows: 'workflows',
  },
  state: () => ({
    states: [],
    workflows: {},
    popupStates: [],
    retrieved: false,
    isFirstTime: false,
  }),
  getters: {
    getAllStates: (state) => [...state.popupStates, ...state.states],
    getById: (state) => (id) => state.workflows[id],
    getWorkflows: (state) => Object.values(state.workflows),
    getWorkflowStates: (state) => (id) =>
      [...state.states, ...state.popupStates].filter(
        ({ workflowId }) => workflowId === id
      ),
  },
  actions: {
    async loadData() {
      const { workflows, isFirstTime } = await browser.storage.local.get([
        'workflows',
        'isFirstTime',
      ]);

      let localWorkflows = workflows || {};

      if (isFirstTime) {
        localWorkflows = firstWorkflows.map((workflow) =>
          defaultWorkflow(workflow)
        );
        await browser.storage.local.set({
          isFirstTime: false,
          workflows: localWorkflows,
        });
      }

      this.isFirstTime = isFirstTime;
      this.workflows = convertWorkflowsToObject(localWorkflows);

      this.retrieved = true;
    },
    updateStates(newStates) {
      this.states = newStates;
    },
    async insert(data = {}, options = {}) {
      const insertedWorkflows = {};

      if (Array.isArray(data)) {
        data.forEach((item) => {
          if (!options.duplicateId) {
            delete item.id;
          }

          const workflow = defaultWorkflow(item, options);
          this.workflows[workflow.id] = workflow;
          insertedWorkflows[workflow.id] = workflow;
        });
      } else {
        if (!options.duplicateId) {
          delete data.id;
        }

        const workflow = defaultWorkflow(data, options);
        this.workflows[workflow.id] = workflow;
        insertedWorkflows[workflow.id] = workflow;
      }

      await this.saveToStorage('workflows');

      return insertedWorkflows;
    },
    async update({ id, data = {}, deep = false }) {
      const isFunction = typeof id === 'function';
      if (!isFunction && !this.workflows[id]) return null;

      const updatedWorkflows = {};
      const updateData = { ...data, updatedAt: Date.now() };

      const workflowUpdater = (workflowId) => {
        if (deep) {
          this.workflows[workflowId] = deepmerge(
            this.workflows[workflowId],
            updateData
          );
        } else {
          Object.assign(this.workflows[workflowId], updateData);
        }

        this.workflows[workflowId].updatedAt = Date.now();
        updatedWorkflows[workflowId] = this.workflows[workflowId];

        if (!('isDisabled' in data)) return;

        if (data.isDisabled) {
          cleanWorkflowTriggers(workflowId);
        } else {
          const triggerBlock = this.workflows[workflowId].drawflow.nodes?.find(
            (node) => node.label === 'trigger'
          );
          if (triggerBlock) {
            registerWorkflowTrigger(id, triggerBlock);
          }
        }
      };

      if (isFunction) {
        this.getWorkflows.forEach((workflow) => {
          const isMatch = id(workflow) ?? false;
          if (isMatch) workflowUpdater(workflow.id);
        });
      } else {
        workflowUpdater(id);
      }

      await this.saveToStorage('workflows');

      return updatedWorkflows;
    },
    async insertOrUpdate(
      data = [],
      { checkUpdateDate = false, duplicateId = false } = {}
    ) {
      const insertedData = {};

      data.forEach((item) => {
        const currentWorkflow = this.workflows[item.id];

        if (currentWorkflow) {
          let insert = true;
          if (checkUpdateDate && currentWorkflow.createdAt && item.updatedAt) {
            insert = dayjs(currentWorkflow.updatedAt).isBefore(item.updatedAt);
          }

          if (insert) {
            const mergedData = deepmerge(this.workflows[item.id], item);

            this.workflows[item.id] = mergedData;
            insertedData[item.id] = mergedData;
          }
        } else {
          const workflow = defaultWorkflow(item, { duplicateId });
          this.workflows[workflow.id] = workflow;
          insertedData[workflow.id] = workflow;
        }
      });

      await this.saveToStorage('workflows');

      return insertedData;
    },
    async delete(id) {
  console.log('🗑️ [Workflow Store] Starting workflow deletion:', id);
  
  // Handle array of IDs
  if (Array.isArray(id)) {
    console.log('🗑️ [Workflow Store] Deleting multiple workflows:', id);
    
    // Delete voice commands for each workflow
    for (const workflowId of id) {
      await this.deleteVoiceCommandsForWorkflow(workflowId);
      delete this.workflows[workflowId];
    }
  } else {
    console.log('🗑️ [Workflow Store] Deleting single workflow:', id);
    
    // Delete voice commands for this workflow
    await this.deleteVoiceCommandsForWorkflow(id);
    delete this.workflows[id];
  }

  await cleanWorkflowTriggers(id);

  const userStore = useUserStore();

  const hostedWorkflow = userStore.hostedWorkflows[id];
  const backupIndex = userStore.backupIds.indexOf(id);

  if (hostedWorkflow || backupIndex !== -1) {
    const response = await fetchApi(`/me/workflows?id=${id}`, {
      auth: true,
      method: 'DELETE',
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message);
    }

    if (backupIndex !== -1) {
      userStore.backupIds.splice(backupIndex, 1);
      await browser.storage.local.set({ backupIds: userStore.backupIds });
    }
  }

  await browser.storage.local.remove([
    `state:${id}`,
    `draft:${id}`,
    `draft-team:${id}`,
  ]);
  await this.saveToStorage('workflows');

  const { pinnedWorkflows } = await browser.storage.local.get(
    'pinnedWorkflows'
  );
  const pinnedWorkflowIndex = pinnedWorkflows?.indexOf(id);
  
  if (pinnedWorkflowIndex !== -1) {
    pinnedWorkflows.splice(pinnedWorkflowIndex, 1);
    await browser.storage.local.set({ pinnedWorkflows });
  }
  
  console.log('✅ [Workflow Store] Workflow deletion completed:', id);
},

// NEW METHOD: Add this voice command cleanup method to the workflow store
async deleteVoiceCommandsForWorkflow(workflowId) {
  try {
    console.log(`🗄️ [Workflow Store] Starting voice command deletion for workflow: ${workflowId}`);
    
    // Get user ID for the request
    const { user } = await browser.storage.local.get('user');
    const userId = user?.id;
    
    if (!userId) {
      console.log(`⚠️ [Workflow Store] No user ID found, skipping voice command cleanup`);
      return;
    }
    
    console.log(`🗄️ [Workflow Store] User ID: ${userId}`);
    console.log(`📤 [Workflow Store] Sending DELETE request to: http://localhost:8000/commands/workflow/${workflowId}`);
    
    // Call the DELETE endpoint that deletes by workflow_id
    const response = await fetch(`http://localhost:8000/commands/workflow/${workflowId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId
      })
    });
    
    console.log(`📥 [Workflow Store] Server response status: ${response.status}`);
    console.log(`📥 [Workflow Store] Server response ok: ${response.ok}`);
    
    if (!response.ok) {
      // Server error - but don't crash workflow deletion
      console.log(`⚠️ [Workflow Store] Server error ${response.status}, but continuing with workflow deletion`);
      
      // Try to parse error response
      try {
        const errorData = await response.text();
        console.log(`⚠️ [Workflow Store] Server error details: ${errorData}`);
      } catch (parseError) {
        console.log(`⚠️ [Workflow Store] Could not parse server error response`);
      }
      
      return; // Don't throw error - let workflow deletion continue
    }
    
    // Parse successful response
    const result = await response.json();
    console.log(`📥 [Workflow Store] Server response data:`, result);
    
    if (result.success) {
      const deletedCount = result.deleted_count || 0;
      
      if (deletedCount > 0) {
        console.log(`✅ [Workflow Store] Successfully deleted ${deletedCount} voice commands for workflow ${workflowId}`);
        
        // Log details of deleted commands
        if (result.commands && result.commands.length > 0) {
          console.log(`✅ [Workflow Store] Deleted commands:`);
          result.commands.forEach((cmd, index) => {
            console.log(`✅ [Workflow Store]   ${index + 1}. "${cmd.command_name}" ${cmd.has_parameter ? `(with parameter: ${cmd.parameter_name})` : '(no parameter)'}`);
          });
        }
      } else {
        console.log(`ℹ️ [Workflow Store] No voice commands found for workflow ${workflowId}`);
      }
    } else {
      console.warn(`⚠️ [Workflow Store] Server reported failure: ${result.message || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.error(`❌ [Workflow Store] Error during voice command cleanup for workflow ${workflowId}:`, error);
    
    // Check for specific error types
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.log(`⚠️ [Workflow Store] Voice command server is not running - skipping database cleanup`);
    } else {
      console.log(`⚠️ [Workflow Store] Unexpected error during voice command cleanup: ${error.message}`);
    }
    
    // Don't throw error - voice command deletion failure shouldn't prevent workflow deletion
    console.log(`⚠️ [Workflow Store] Voice command cleanup failed, but continuing with workflow deletion`);
  }
}
  },
});
