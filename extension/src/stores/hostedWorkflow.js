import { defineStore } from 'pinia';
import browser from 'webextension-polyfill';
import { fetchApi } from '@/utils/api';
import {
  registerWorkflowTrigger,
  cleanWorkflowTriggers,
} from '@/utils/workflowTrigger';
import { findTriggerBlock } from '@/utils/helper';

export const useHostedWorkflowStore = defineStore('hosted-workflows', {
  storageMap: {
    workflows: 'workflowHosts',
  },
  state: () => ({
    workflows: {},
    retrieved: false,
  }),
  getters: {
    getById: (state) => (id) => state.workflows[id],
    toArray: (state) => Object.values(state.workflows),
  },
  actions: {
    async loadData() {
      const { workflowHosts } = await browser.storage.local.get(
        'workflowHosts'
      );
      this.workflows = workflowHosts || {};
      this.retrieved = true;
    },
    async insert(data, idKey = 'hostId') {
      if (Array.isArray(data)) {
        data.forEach((item) => {
          this.workflows[idKey] = item;
        });
      } else {
        this.workflows[idKey] = data;
      }

      await this.saveToStorage('workflows');

      return data;
    },
   async delete(id) {
  console.log('🗑️ [Hosted Workflow Store] Starting hosted workflow deletion:', id);
  
  // Delete voice commands for this workflow
  await this.deleteVoiceCommandsForWorkflow(id);
  
  delete this.workflows[id];

  await this.saveToStorage('workflows');
  await cleanWorkflowTriggers(id);

  console.log('✅ [Hosted Workflow Store] Hosted workflow deletion completed:', id);
  
  return id;
},

// NEW METHOD: Add this voice command cleanup method to the hosted workflow store
async deleteVoiceCommandsForWorkflow(workflowId) {
  try {
    console.log(`🗄️ [Hosted Workflow Store] Starting voice command deletion for workflow: ${workflowId}`);
    
    // Get user ID for the request
    const { user } = await browser.storage.local.get('user');
    const userId = user?.id;
    
    if (!userId) {
      console.log(`⚠️ [Hosted Workflow Store] No user ID found, skipping voice command cleanup`);
      return;
    }
    
    console.log(`🗄️ [Hosted Workflow Store] User ID: ${userId}`);
    console.log(`📤 [Hosted Workflow Store] Sending DELETE request to: http://localhost:8000/commands/workflow/${workflowId}`);
    
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
    
    console.log(`📥 [Hosted Workflow Store] Server response status: ${response.status}`);
    
    if (!response.ok) {
      console.log(`⚠️ [Hosted Workflow Store] Server error ${response.status}, but continuing with workflow deletion`);
      return;
    }
    
    const result = await response.json();
    console.log(`📥 [Hosted Workflow Store] Server response data:`, result);
    
    if (result.success && result.deleted_count > 0) {
      console.log(`✅ [Hosted Workflow Store] Successfully deleted ${result.deleted_count} voice commands for workflow ${workflowId}`);
    } else {
      console.log(`ℹ️ [Hosted Workflow Store] No voice commands found for workflow ${workflowId}`);
    }
    
  } catch (error) {
    console.error(`❌ [Hosted Workflow Store] Error during voice command cleanup for workflow ${workflowId}:`, error);
    console.log(`⚠️ [Hosted Workflow Store] Voice command cleanup failed, but continuing with workflow deletion`);
  }
},
    async update({ id, data }) {
      if (!this.workflows[id]) return null;

      Object.assign(this.workflows[id], data);
      await this.saveToStorage('workflows');

      return this.workflows[id];
    },
    async fetchWorkflows(ids) {
      if (!ids || ids.length === 0) return null;

      const response = await fetchApi('/workflows/hosted', {
        auth: true,
        method: 'POST',
        body: JSON.stringify({ hosts: ids }),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.message);

      const dataToReturn = [];

      result.forEach(({ hostId, status, data }) => {
        if (status === 'deleted') {
          delete this.workflows[hostId];
          cleanWorkflowTriggers(hostId);
          return;
        }
        if (status === 'updated') {
          const triggerBlock = findTriggerBlock(data.drawflow);
          registerWorkflowTrigger(hostId, triggerBlock);
        }

        data.hostId = hostId;
        dataToReturn.push(data);
        this.workflows[hostId] = data;
      });

      await this.saveToStorage('workflows');

      return dataToReturn;
    },
  },
});
