<template>
  <div class="container mx-auto max-w-4xl p-6">
    <div class="mb-6">
      <h1 class="text-3xl font-bold mb-2">Command Tester</h1>
      <p class="text-gray-600 dark:text-gray-300">
        Test your recorded workflows by typing natural language commands
      </p>
    </div>

    <!-- Command Input Section -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
      <div class="mb-4">
        <label class="block text-sm font-medium mb-2">Enter Command</label>
        <div class="flex gap-3">
          <ui-input
            v-model="commandInput"
            placeholder="e.g., Search Batman on Youtube"
            class="flex-1"
            @keyup.enter="executeCommand"
            :disabled="isExecuting"
          />
          <ui-button
            @click="executeCommand"
            :disabled="!commandInput.trim() || isExecuting"
            variant="accent"
          >
            <ui-spinner v-if="isExecuting" size="16" class="mr-2" />
            <v-remixicon v-else name="riPlayLine" class="mr-2" />
            Execute
          </ui-button>
        </div>
      </div>

      <!-- Execution Status -->
      <div v-if="lastResult" class="mt-4 p-4 rounded-lg" :class="resultClass">
        <div class="flex items-center">
          <v-remixicon 
            :name="lastResult.success ? 'riCheckLine' : 'riCloseLine'" 
            class="mr-2"
          />
          <span class="font-medium">{{ lastResult.message }}</span>
        </div>
        <div v-if="lastResult.success && lastResult.command" class="mt-2 text-sm">
          <p><strong>Matched Command:</strong> {{ lastResult.command }}</p>
          <p v-if="lastResult.parameter"><strong>Parameter:</strong> {{ lastResult.parameter }}</p>
          <p><strong>Workflow ID:</strong> {{ lastResult.workflow_id }}</p>
        </div>
      </div>
    </div>

    <!-- Available Commands Section -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold">Available Commands</h2>
        <ui-button @click="loadCommands" variant="outline" size="sm">
          <v-remixicon name="riRefreshLine" class="mr-2" />
          Refresh
        </ui-button>
      </div>

      <div v-if="loading" class="text-center py-8">
        <ui-spinner size="32" />
        <p class="mt-2 text-gray-600 dark:text-gray-300">Loading commands...</p>
      </div>

      <div v-else-if="commands.length === 0" class="text-center py-8 text-gray-500">
        <v-remixicon name="riInboxLine" size="48" class="mx-auto mb-4 opacity-50" />
        <p>No commands found. Record some workflows with parameters first!</p>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="command in commands"
          :key="command.id"
          class="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <p class="font-medium">{{ command.command_name }}</p>
              <div class="mt-1 text-sm text-gray-600 dark:text-gray-300">
                <span v-if="command.has_parameter" class="inline-flex items-center">
                  <v-remixicon name="riInputMethodLine" class="mr-1" size="14" />
                  Parameter: {{ command.parameter_name }}
                </span>
                <span v-else class="inline-flex items-center">
                  <v-remixicon name="riCommandLine" class="mr-1" size="14" />
                  No parameters
                </span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <ui-button
                @click="useAsTemplate(command)"
                variant="outline"
                size="sm"
              >
                <v-remixicon name="riFileCopyLine" class="mr-1" />
                Use
              </ui-button>
              <ui-button
                @click="deleteCommand(command)"
                variant="danger"
                size="sm"
              >
                <v-remixicon name="riDeleteBinLine" />
              </ui-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Execution History -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <h2 class="text-xl font-semibold mb-4">Execution History</h2>
      
      <div v-if="executionHistory.length === 0" class="text-center py-8 text-gray-500">
        <v-remixicon name="riHistoryLine" size="48" class="mx-auto mb-4 opacity-50" />
        <p>No executions yet. Try running some commands!</p>
      </div>

      <div v-else class="space-y-2 max-h-64 overflow-y-auto">
        <div
          v-for="(execution, index) in executionHistory"
          :key="index"
          class="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded"
        >
          <div class="flex items-center">
            <v-remixicon 
              :name="execution.success ? 'riCheckLine' : 'riCloseLine'"
              :class="execution.success ? 'text-green-500' : 'text-red-500'"
              class="mr-2"
            />
            <span class="font-medium">{{ execution.command }}</span>
            <span v-if="execution.parameter" class="ml-2 text-sm text-gray-600 dark:text-gray-300">
              ({{ execution.parameter }})
            </span>
          </div>
          <span class="text-xs text-gray-500">
            {{ formatTime(execution.timestamp) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useToast } from 'vue-toastification';
import browser from 'webextension-polyfill';
import { MessageListener } from '@/utils/message';
import { useWorkflowStore } from '@/stores/workflow';

const toast = useToast();
const workflowStore = useWorkflowStore();

const commandInput = ref('');
const commands = ref([]);
const loading = ref(false);
const isExecuting = ref(false);
const lastResult = ref(null);
const executionHistory = ref([]);

const resultClass = computed(() => {
  if (!lastResult.value) return '';
  return lastResult.value.success 
    ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
    : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800';
});

const executeCommand = async () => {
  if (!commandInput.value.trim() || isExecuting.value) return;
  
  isExecuting.value = true;
  lastResult.value = null;
  
  try {
    console.log('🚀 Command Tester: Starting execution');
    console.log('📝 Command:', commandInput.value);
    
    // Get user ID
    const { user } = await browser.storage.local.get('user');
    const userId = user?.id || 'default_user';
    
    console.log('👤 User ID:', userId);
    
    // Send command to server
    console.log('📡 Sending command to server...');
    const response = await fetch('http://localhost:8000/execute-command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_input: commandInput.value,
        user_id: userId
      }),
    });
    
    const result = await response.json();
    console.log('📥 Server response:', result);
    
    lastResult.value = result;
    
    // Add to execution history
    executionHistory.value.unshift({
      command: commandInput.value,
      parameter: result.parameter,
      success: result.success,
      timestamp: Date.now()
    });
    
    // Keep only last 50 executions
    if (executionHistory.value.length > 50) {
      executionHistory.value = executionHistory.value.slice(0, 50);
    }
    
    if (result.success && result.workflow_id) {
      console.log('✅ Command matched! Workflow ID:', result.workflow_id);
      
      // Get workflow from store
      const workflow = workflowStore.getById(result.workflow_id);
      console.log('📋 Found workflow:', workflow);
      
      if (workflow) {
        // Create a copy of the workflow for parameter replacement
        let workflowToExecute = JSON.parse(JSON.stringify(workflow));
        
        // If has parameter, replace it in the workflow
        if (result.parameter) {
          console.log('🔧 Replacing parameter:', result.parameter);
          
          // Replace {{parameter}} with actual value in forms blocks
          if (workflowToExecute.drawflow && workflowToExecute.drawflow.nodes) {
            let replacementCount = 0;
            workflowToExecute.drawflow.nodes.forEach(node => {
              if (node.label === 'forms' && node.data && node.data.value) {
                if (node.data.value.includes('{{parameter}}')) {
                  console.log(`📝 Before replacement in node ${node.id}:`, node.data.value);
                  node.data.value = node.data.value.replace(/\{\{parameter\}\}/g, result.parameter);
                  console.log(`✅ After replacement in node ${node.id}:`, node.data.value);
                  replacementCount++;
                }
              }
            });
            console.log(`🔢 Total parameter replacements: ${replacementCount}`);
          }
        }
        
        console.log('🎯 Final workflow to execute:', workflowToExecute);
        
        // Execute workflow directly via background message (bypass RendererWorkflowService)
        console.log('📤 Sending workflow to background...');
        
        const executionResult = await MessageListener.sendMessage(
          'workflow:execute',
          workflowToExecute,
          'background'
        );
        
        console.log('✅ Workflow execution result:', executionResult);
        toast.success(`Executing workflow: ${workflow.name}`);
        
      } else {
        console.error('❌ Workflow not found in local storage');
        toast.error('Workflow not found locally');
        lastResult.value = {
          success: false,
          message: 'Workflow not found in local storage'
        };
      }
    } else if (!result.success) {
      console.log('❌ Command not matched:', result.message);
      toast.error(result.message || 'Command not found');
    }
    
  } catch (error) {
    console.error('❌ Error executing command:', error);
    toast.error('Failed to execute command. Make sure the API server is running.');
    
    lastResult.value = {
      success: false,
      message: 'Failed to connect to command server'
    };
    
    executionHistory.value.unshift({
      command: commandInput.value,
      success: false,
      timestamp: Date.now()
    });
  } finally {
    isExecuting.value = false;
    console.log('🏁 Command execution finished');
  }
};

const loadCommands = async () => {
  loading.value = true;
  
  try {
    const { user } = await browser.storage.local.get('user');
    const userId = user?.id || 'default_user';
    
    const response = await fetch(`http://localhost:8000/commands/${userId}`);
    const data = await response.json();
    
    commands.value = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error loading commands:', error);
    toast.error('Failed to load commands');
    commands.value = [];
  } finally {
    loading.value = false;
  }
};

const useAsTemplate = (command) => {
  commandInput.value = command.command_name;
};

const deleteCommand = async (command) => {
  try {
    const response = await fetch(`http://localhost:8000/commands/${command.id}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.success) {
      toast.success('Command deleted');
      loadCommands(); // Reload commands
    } else {
      toast.error('Failed to delete command');
    }
  } catch (error) {
    console.error('Error deleting command:', error);
    toast.error('Failed to delete command');
  }
};

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString();
};

onMounted(() => {
  loadCommands();
});
</script>