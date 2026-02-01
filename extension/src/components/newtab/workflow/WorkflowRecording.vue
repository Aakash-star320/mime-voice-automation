<template>
  <div class="container py-8 mx-auto">
    <div class="max-w-lg mx-auto">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <div class="flex items-center justify-center mb-6">
          <div class="recording-indicator">
            <div class="recording-dot"></div>
          </div>
          <h1 class="text-2xl font-bold ml-4">
            {{ isRecording ? 'Recording...' : 'New Recording' }}
          </h1>
        </div>

        <div v-if="!isRecording" class="space-y-4">
          <ui-input
            v-model="workflowName"
            placeholder="Enter workflow name"
            label="Workflow Name"
            class="w-full"
          />
          
          <ui-textarea
            v-model="workflowDescription"
            placeholder="Enter workflow description (optional)"
            label="Description"
            class="w-full"
            :rows="3"
          />

          <ui-button
            @click="startRecording"
            variant="accent"
            class="w-full"
            :disabled="!workflowName.trim()"
          >
            <v-remixicon name="riRecordCircleLine" class="mr-2" />
            Start Recording
          </ui-button>
        </div>

        <div v-else class="space-y-4">
          <div class="bg-gray-100 dark:bg-gray-700 rounded p-4">
            <h3 class="font-semibold mb-2">Recording: {{ workflowName }}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-300">
              Navigate to a website and start interacting with it. Your actions will be recorded.
            </p>
          </div>

          <div class="recorded-actions">
            <h4 class="font-semibold mb-2">Recorded Actions ({{ recordedFlows.length }})</h4>
            <div class="space-y-2 max-h-60 overflow-y-auto">
              <div
                v-for="(flow, index) in recordedFlows"
                :key="index"
                class="flex items-center p-2 bg-gray-50 dark:bg-gray-700 rounded"
              >
                <v-remixicon :name="getFlowIcon(flow.id)" class="mr-2" />
                <span class="text-sm">{{ flow.description || flow.id }}</span>
              </div>
            </div>
          </div>

          <div class="flex space-x-2">
            <ui-button
              @click="stopRecording"
              variant="danger"
              class="flex-1"
            >
              <v-remixicon name="riStopCircleLine" class="mr-2" />
              Stop Recording
            </ui-button>
            
            <ui-button
              @click="saveRecording"
              variant="accent"
              class="flex-1"
              :disabled="recordedFlows.length === 0"
            >
              <v-remixicon name="riSaveLine" class="mr-2" />
              Save Workflow
            </ui-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, toRaw } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import browser from 'webextension-polyfill';
import { sendMessage } from '@/utils/message';
import { useWorkflowStore } from '@/stores/workflow';
import { useDialog } from '@/composable/dialog';
import { nanoid } from 'nanoid';

const router = useRouter();
const toast = useToast();
const workflowStore = useWorkflowStore();
const dialog = useDialog();

const isRecording = ref(false);
const workflowName = ref('');
const workflowDescription = ref('');
const recordedFlows = ref([]);

// Recording state management
const state = ref({
  isGenerating: false,
  name: '',
  description: '',
  flows: [],
  workflowId: null,
  connectFrom: null
});

let recordingCheckInterval = null;

const getFlowIcon = (flowId) => {
  const iconMap = {
    'event-click': 'riCursorLine',
    'forms': 'riInputMethodLine',
    'press-key': 'riKeyboardLine',
    'link': 'riLinkM',
    'element-scroll': 'riScrollToBottomLine',
    'trigger-event': 'riFocusLine',
    'upload-file': 'riUploadLine',
    'new-tab': 'riAddBoxLine',
    'switch-tab': 'riPagesLine'
  };
  return iconMap[flowId] || 'riQuestionLine';
};

const startRecording = async () => {
  try {
    // Get active tab
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab || !activeTab.url.startsWith('http')) {
      toast.error('Please navigate to a website first');
      return;
    }

    // Initialize recording data
    await browser.storage.local.set({
      isRecording: true,
      recording: {
        name: workflowName.value,
        description: workflowDescription.value,
        flows: []
      }
    });

    // Update state
    state.value.name = workflowName.value;
    state.value.description = workflowDescription.value;
    state.value.flows = [];

    // Inject recording script
    await sendMessage('inject:recordWorkflow', { tabId: activeTab.id }, 'background');
    
    isRecording.value = true;
    
    // Set badge to indicate recording
    await browser.action.setBadgeBackgroundColor({ color: '#ef4444' });
    await browser.action.setBadgeText({ text: 'rec' });
    
    // Start monitoring recording progress
    recordingCheckInterval = setInterval(checkRecordingProgress, 1000);
    
    toast.success('Recording started!');
  } catch (error) {
    console.error('Failed to start recording:', error);
    toast.error('Failed to start recording. Please try again.');
  }
};

const checkRecordingProgress = async () => {
  const { recording } = await browser.storage.local.get('recording');
  if (recording && recording.flows) {
    recordedFlows.value = recording.flows;
    state.value.flows = recording.flows;
  }
};

const stopRecording = async () => {
  if (state.value.isGenerating) return;

  try {
    state.value.isGenerating = true;

    console.log('🛑 Stopping recording...');
    console.log('📊 Recorded flows:', state.value.flows);

    // Check if recording has parameters BEFORE saving
    const hasParameter = state.value.flows.some(flow => 
      flow.id === 'forms' && 
      flow.data?.value?.includes('{{parameter}}')
    );

    console.log('🔍 Has parameter:', hasParameter);

    if (state.value.flows.length !== 0) {
      let savedWorkflowId = null;
      
      if (state.value.workflowId) {
        console.log('📝 Updating existing workflow:', state.value.workflowId);
        // UPDATE existing workflow
        const workflow = workflowStore.getById(state.value.workflowId);
        const startBlock = workflow.drawflow.nodes.find(
          (node) => node.id === state.value.connectFrom.id
        );
        const updatedDrawflow = generateDrawflow(state.value.connectFrom, startBlock);

        const drawflow = {
          ...workflow.drawflow,
          nodes: [...workflow.drawflow.nodes, ...updatedDrawflow.nodes],
          edges: [...workflow.drawflow.edges, ...updatedDrawflow.edges],
        };

        await workflowStore.update({
          id: state.value.workflowId,
          data: { drawflow },
        });
        
        savedWorkflowId = state.value.workflowId;
      } else {
        console.log('📝 Creating new workflow:', state.value.name);
        // CREATE new workflow
        const drawflow = generateDrawflow();

        const insertedWorkflows = await workflowStore.insert({
          drawflow,
          name: state.value.name,
          description: state.value.description ?? '',
        });
        
        // Get the ID of the newly created workflow
        savedWorkflowId = Object.keys(insertedWorkflows)[0];
        console.log('✅ New workflow created with ID:', savedWorkflowId);
      }

      // Handle parameter and API save
      if (savedWorkflowId) {
        console.log('💾 Preparing to save command to API...');
        
        if (hasParameter) {
          console.log('⚙️ Workflow has parameter, showing dialog...');
          
          // Show parameter dialog
          dialog.prompt({
            title: 'Parameter Configuration',
            placeholder: 'Enter parameter name (e.g., "Flash", "Batman", "search term")',
            body: 'This workflow contains a parameter. What should we call it?',
            okText: 'Save Command',
            onConfirm: async (parameterName) => {
              console.log('✅ Parameter name provided:', parameterName);
              
              if (parameterName?.trim()) {
                // Save to API with parameter
                await saveCommandToAPI({
                  workflow_id: savedWorkflowId,
                  command_name: state.value.name,
                  has_parameter: true,
                  parameter_name: parameterName.trim()
                });
              }
              // Continue with navigation
              navigateAfterSave(savedWorkflowId);
            },
            onCancel: () => {
              console.log('❌ Parameter dialog cancelled');
              // Still navigate even if cancelled
              navigateAfterSave(savedWorkflowId);
            }
          });
          
          // Don't navigate yet - wait for dialog
          return;
        } else {
          console.log('📝 No parameter, saving command directly...');
          // No parameter - save and navigate
          await saveCommandToAPI({
            workflow_id: savedWorkflowId,
            command_name: state.value.name,
            has_parameter: false,
            parameter_name: null
          });
        }
        
        navigateAfterSave(savedWorkflowId);
      }
    } else {
      console.log('⚠️ No flows recorded');
      // No flows recorded
      navigateAfterSave(null);
    }
  } catch (error) {
    state.value.isGenerating = false;
    console.error('❌ Error in stopRecording:', error);
    toast.error('Failed to save recording');
  }
};

// Function to save command to API
async function saveCommandToAPI(commandData) {
  try {
    console.log('📡 Saving command to API...', commandData);
    
    // Get user ID from storage
    const { user } = await browser.storage.local.get('user');
    const userId = user?.id || 'default_user';
    
    console.log('👤 User ID:', userId);
    
    const response = await fetch('http://localhost:8000/save-command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        command_name: commandData.command_name,
        has_parameter: commandData.has_parameter,
        parameter_name: commandData.parameter_name,
        workflow_id: commandData.workflow_id
      }),
    });
    
    const result = await response.json();
    
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to save command');
    }
    
    console.log('✅ Command saved successfully to PostgreSQL:', result);
    
    // Save command reference locally too
    const { savedCommands = [] } = await browser.storage.local.get('savedCommands');
    savedCommands.push({
      ...commandData,
      user_id: userId,
      api_id: result.id,
      created_at: Date.now()
    });
    await browser.storage.local.set({ savedCommands });
    
    // Show success notification
    toast.success('Command saved successfully!');
    
    return result;
  } catch (error) {
    console.error('❌ Failed to save command to API:', error);
    
    // Show error notification but don't throw - let workflow save continue
    toast.error('Failed to save command. Make sure the API server is running.');
    
    return null;
  }
}

// Function to navigate after save
async function navigateAfterSave(workflowId) {
  console.log('🚀 Navigating after save...');
  
  await browser.storage.local.remove(['isRecording', 'recording']);
  await browser.action.setBadgeText({ text: '' });

  const tabs = (await browser.tabs.query({})).filter((tab) =>
    tab.url.startsWith('http')
  );
  Promise.allSettled(
    tabs.map(({ id }) =>
      browser.tabs.sendMessage(id, { type: 'recording:stop' })
    )
  );

  state.value.isGenerating = false;

  if (state.value.workflowId) {
    router.replace(
      `/workflows/${state.value.workflowId}?blockId=${state.value.connectFrom.id}`
    );
  } else if (workflowId) {
    router.replace(`/workflows/${workflowId}`);
  } else {
    router.replace('/');
  }
}

// Generate drawflow function
function generateDrawflow(connectFrom, startBlock) {
  const nodes = [];
  const edges = [];
  
  // Add trigger node if this is a new workflow
  if (!connectFrom) {
    const triggerId = 'trigger-' + nanoid(8);
    nodes.push({
      id: triggerId,
      label: 'trigger',
      position: { x: 252, y: 68 },
      data: {},
      type: 'BlockBasic'
    });
    
    // Add active-tab node
    const activeTabId = 'active-tab-' + nanoid(8);
    nodes.push({
      id: activeTabId,
      label: 'active-tab',
      position: { x: 252, y: 188 },
      data: {},
      type: 'BlockBasic'
    });
    
    // Create edge from trigger to active-tab
    edges.push({
      id: `${triggerId}-${activeTabId}`,
      source: triggerId,
      target: activeTabId,
      sourceHandle: `${triggerId}-output-1`,
      targetHandle: `${activeTabId}-input-1`
    });
    
    connectFrom = { id: activeTabId };
  }
  
  // Convert recorded flows to nodes
  let position = { x: 252, y: 308 };
  let previousNodeId = connectFrom.id;
  
  state.value.flows.forEach((flow, index) => {
    const nodeId = `${flow.id}-${nanoid(8)}`;
    
    const node = {
      id: nodeId,
      label: flow.id,
      data: flow.data || {},
      position: { ...position },
      type: 'BlockBasic'
    };
    
    // Create edge from previous node
    if (previousNodeId) {
      edges.push({
        id: `${previousNodeId}-${nodeId}`,
        source: previousNodeId,
        target: nodeId,
        sourceHandle: `${previousNodeId}-output-1`,
        targetHandle: `${nodeId}-input-1`
      });
    }
    
    nodes.push(node);
    previousNodeId = nodeId;
    position.y += 120;
  });
  
  return { nodes, edges };
}

const saveRecording = async () => {
  await stopRecording();
};

// Legacy methods for compatibility
isRecording.value = false;

onMounted(async () => {
  // Check if already recording
  const { isRecording: recordingActive, recording } = await browser.storage.local.get(['isRecording', 'recording']);
  
  if (recordingActive && recording) {
    isRecording.value = true;
    workflowName.value = recording.name || '';
    workflowDescription.value = recording.description || '';
    recordedFlows.value = recording.flows || [];
    
    // Update internal state
    state.value.name = recording.name || '';
    state.value.description = recording.description || '';
    state.value.flows = recording.flows || [];
    
    // Resume monitoring
    recordingCheckInterval = setInterval(checkRecordingProgress, 1000);
  }
});

onBeforeUnmount(() => {
  if (recordingCheckInterval) {
    clearInterval(recordingCheckInterval);
  }
});
</script>

<style scoped>
.recording-indicator {
  @apply relative w-8 h-8;
}

.recording-dot {
  @apply absolute inset-0 bg-red-500 rounded-full;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.8);
  }
}

.recorded-actions {
  @apply border border-gray-200 dark:border-gray-600 rounded-lg p-4;
}
</style>