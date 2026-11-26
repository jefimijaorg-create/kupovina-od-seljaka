// Nabavka modul je privremeno resetovan. Fajl ostaje kao mesto za novu implementaciju.
export const PROCUREMENT_STAGES = Object.freeze({ UNASSIGNED:'unassigned', ASSIGNED:'assigned', SENT:'sent', CONFIRMED:'confirmed', COLLECTED:'collected' });
export function getProcurementStage() { return 'unassigned'; }
export function getProcurementStageLabel() { return ''; }
export function canMarkProcurementSent() { return false; }
export function canConfirmProcurement() { return false; }
export function canCollectProcurement() { return false; }
export function validateProcurementCounts() { return { valid:false, error:'Nabavka je resetovana.' }; }
export function validateAllocationCount() { return { valid:false, error:'Nabavka je resetovana.' }; }
