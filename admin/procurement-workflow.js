/*
 * NARUČI DOMAĆE — PROCUREMENT WORKFLOW
 * Version: 1.0.3
 * Updated: 2026-11-18
 * Description: Pure validation and transition rules driven by requested, confirmed and collected quantities; technical allocation counts are not business statuses.
 * Scope: Existing ADMIN Workspace only. No schema, trigger, RLS, or legacy changes.
 */
export const PROCUREMENT_STAGES = Object.freeze({ UNASSIGNED:'unassigned', ASSIGNED:'assigned', SENT:'sent', CONFIRMED:'confirmed', COLLECTED:'collected' });
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const wholeNonNegative = value => Number.isInteger(Number(value)) && Number(value) >= 0;
export function getProcurementStage(row) {
 if (!row || number(row.naruceno_pakovanja) <= 0) return PROCUREMENT_STAGES.UNASSIGNED;
 if (number(row.preuzeto_pakovanja) > 0) return PROCUREMENT_STAGES.COLLECTED;
 if (number(row.potvrdjeno_pakovanja) > 0) return PROCUREMENT_STAGES.CONFIRMED;
 if ((row.viber_status === 'sent' || row.viber_status === 'replied') && number(row.naruceno_pakovanja) > 0) return PROCUREMENT_STAGES.SENT;
 return PROCUREMENT_STAGES.ASSIGNED;
}
export function getProcurementStageLabel(stage) { return ({unassigned:'У припреми',assigned:'Додељено',sent:'Послато',confirmed:'Потврђено',collected:'Преузето'})[stage] || 'Непознат статус'; }
export function canMarkProcurementSent(row) { return getProcurementStage(row) === PROCUREMENT_STAGES.ASSIGNED && number(row.naruceno_pakovanja) > 0; }
export function canConfirmProcurement(row) { const stage=getProcurementStage(row); return (row.viber_status === 'sent' || row.viber_status === 'replied') && [PROCUREMENT_STAGES.SENT,PROCUREMENT_STAGES.CONFIRMED,PROCUREMENT_STAGES.COLLECTED].includes(stage) && number(row.potvrdjeno_pakovanja) < number(row.naruceno_pakovanja); }
export function canCollectProcurement(row) { const stage=getProcurementStage(row); return [PROCUREMENT_STAGES.CONFIRMED,PROCUREMENT_STAGES.COLLECTED].includes(stage) && number(row.preuzeto_pakovanja) < number(row.potvrdjeno_pakovanja); }
export function validateProcurementCounts(row, {confirmed,collected} = {}) {
 if (!wholeNonNegative(confirmed) || !wholeNonNegative(collected)) return {valid:false,error:'Количине морају бити цели ненегативни бројеви паковања.'};
 if (!canConfirmProcurement(row) && Number(confirmed) !== number(row.potvrdjeno_pakovanja)) return {valid:false,error:'Потврда је дозвољена тек након евидентираног слања захтева.'};
 if (!canCollectProcurement(row) && Number(collected) !== number(row.preuzeto_pakovanja)) return {valid:false,error:'Преузимање је дозвољено тек након потврде произвођача.'};
 if (Number(confirmed) > number(row.naruceno_pakovanja)) return {valid:false,error:'Потврђена количина не може бити већа од послате количине.'};
 if (Number(collected) > Number(confirmed)) return {valid:false,error:'Преузета количина не може бити већа од потврђене количине.'};
 return {valid:true,error:''};
}
export function validateAllocationCount({requested,alreadyAllocated,demand}) {
 if (![requested,alreadyAllocated,demand].every(wholeNonNegative)) return {valid:false,error:'Количине паковања морају бити цели ненегативни бројеви.'};
 if (Number(requested) <= 0) return {valid:false,error:'Додела мора садржати бар једно паковање.'};
 if (Number(requested) + Number(alreadyAllocated) > Number(demand)) return {valid:false,error:'Додела прелази преосталу потребу туре.'};
 return {valid:true,error:''};
}