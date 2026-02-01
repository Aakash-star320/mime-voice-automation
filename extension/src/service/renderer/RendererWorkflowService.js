//This is the updated RendererWorkflowService.js of Mime
import { MessageListener } from '@/utils/message';
import { toRaw } from 'vue';
import { hasParameters, promptForParameters, replaceParametersInWorkflow } from '@/utils/parameterHandler';

class RendererWorkflowService {
  static async executeWorkflow(workflowData, options) {
    /**
     * Convert Vue-created proxy into plain object.
     * It will throw error if there a proxy inside the object.
     */
    const clonedWorkflowData = {};
    Object.keys(workflowData).forEach((key) => {
      clonedWorkflowData[key] = toRaw(workflowData[key]);
    });

    let workflowToExecute = clonedWorkflowData;
    
    // Check if workflow has parameters
    if (hasParameters(clonedWorkflowData)) {
      try {
        const parameterValues = await promptForParameters();
        
        if (!parameterValues) {
          console.log('Workflow execution cancelled by user');
          return null;
        }
        
        // Replace parameters with actual values
        workflowToExecute = replaceParametersInWorkflow(clonedWorkflowData, parameterValues);
        console.log('Parameters replaced successfully:', parameterValues);
      } catch (error) {
        console.error('Error handling parameters:', error);
        return null;
      }
    }

    return MessageListener.sendMessage(
      'workflow:execute',
      { ...workflowToExecute, options },
      'background'
    );
  }

  static stopWorkflowExecution(executionId) {
    return MessageListener.sendMessage(
      'workflow:stop',
      executionId,
      'background'
    );
  }
}

export default RendererWorkflowService;