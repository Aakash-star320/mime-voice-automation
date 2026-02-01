// Add this to your workflow execution handler
// This should be added to your workflow execution handler

export function replaceParametersInWorkflow(workflowData, parameterValues) {
  // Clone the workflow to avoid mutating the original
  const clonedWorkflow = JSON.parse(JSON.stringify(workflowData));
  
  // Find all blocks with parameters
  const blocksWithParameters = [];
  
  if (clonedWorkflow.drawflow && clonedWorkflow.drawflow.nodes) {
    clonedWorkflow.drawflow.nodes.forEach(node => {
      // Check for forms blocks specifically
      if (node.data && node.data.value && node.data.value.includes('{{parameter}}')) {
        blocksWithParameters.push(node);
      }
    });
  }
  
  // Replace {{parameter}} with actual value
  const parameterValue = parameterValues.parameter || '';
  
  blocksWithParameters.forEach(block => {
    if (block.data.value) {
      block.data.value = block.data.value.replace(/\{\{parameter\}\}/g, parameterValue);
      console.log(`Replaced parameter in block ${block.id}: ${block.data.value}`);
    }
  });
  
  console.log(`Found and processed ${blocksWithParameters.length} blocks with parameters`);
  
  return clonedWorkflow;
}

export function hasParameters(workflowData) {
  if (!workflowData.drawflow || !workflowData.drawflow.nodes) return false;
  
  return workflowData.drawflow.nodes.some(node => {
    // Check different possible locations for form values
    if (node.data) {
      // Check direct value property
      if (node.data.value && node.data.value.includes('{{parameter}}')) {
        return true;
      }
      // Check forms data (since we're using forms blocks)
      if (node.label === 'forms' && node.data.value && node.data.value.includes('{{parameter}}')) {
        return true;
      }
    }
    return false;
  });
}

export function promptForParameters() {
  return new Promise((resolve) => {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    // Create modal content
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: white;
      padding: 24px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      max-width: 400px;
      width: 90%;
    `;
    
    modal.innerHTML = `
      <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #333;">Enter Parameter Value</h3>
      <p style="margin: 0 0 16px 0; color: #666; font-size: 14px;">
        This workflow contains a parameter. Please enter the value to use:
      </p>
      <input 
        type="text" 
        id="parameter-input"
        placeholder="Enter parameter value..."
        style="
          width: 100%; 
          padding: 8px 12px; 
          border: 1px solid #ddd; 
          border-radius: 4px; 
          font-size: 14px;
          margin-bottom: 16px;
          box-sizing: border-box;
        "
      >
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button 
          id="cancel-btn"
          style="
            padding: 8px 16px; 
            border: 1px solid #ddd; 
            background: white; 
            border-radius: 4px; 
            cursor: pointer;
            font-size: 14px;
          "
        >Cancel</button>
        <button 
          id="confirm-btn"
          style="
            padding: 8px 16px; 
            border: none; 
            background: #007bff; 
            color: white; 
            border-radius: 4px; 
            cursor: pointer;
            font-size: 14px;
          "
        >Confirm</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const input = modal.querySelector('#parameter-input');
    const cancelBtn = modal.querySelector('#cancel-btn');
    const confirmBtn = modal.querySelector('#confirm-btn');
    
    // Focus input
    input.focus();
    
    // Handle confirm
    const handleConfirm = () => {
      const value = input.value.trim();
      document.body.removeChild(overlay);
      resolve({ parameter: value });
    };
    
    // Handle cancel
    const handleCancel = () => {
      document.body.removeChild(overlay);
      resolve(null);
    };
    
    // Event listeners
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    
    // Enter key to confirm
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleConfirm();
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    });
    
    // Click overlay to cancel
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        handleCancel();
      }
    });
  });
}