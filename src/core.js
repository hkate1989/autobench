const round=n=>Number(n.toFixed(3));
export class Environment {
  constructor({task,search}){this.task=task;this.groundTruth=task.groundTruth;this.search=search;}
  async evaluate(policy){const run=await policy.run(this.task,this.search),predicted=[...new Set(run.predictions)],truth=new Set(this.groundTruth),tp=predicted.filter(x=>truth.has(x)),fp=predicted.filter(x=>!truth.has(x)),fn=this.groundTruth.filter(x=>!predicted.includes(x)),precision=predicted.length?tp.length/predicted.length:0,recall=tp.length/this.groundTruth.length,f1=precision+recall?2*precision*recall/(precision+recall):0;return{taskId:this.task.id,policy:policy.name,predictions:predicted,metrics:{precision:round(precision),recall:round(recall),f1:round(f1)},failureAnalysis:{candidateOmission:fn,falsePositives:fp,unknownRejected:run.unknowns,queryCount:run.queries.length,queries:run.queries}};}
}
export class ResearchPolicy { constructor(spec){Object.assign(this,spec);} run(task,search){return this.execute(task,search);} }
export class AutoBenchOptimizer {
  constructor({environment,policies}){this.environment=environment;this.policies=policies;}
  diagnose(r){if(r.failureAnalysis.candidateOmission.length)return"candidate_omission_high";if(r.failureAnalysis.unknownRejected.length)return"unknown_rejection_high";return"no_actionable_failure";}
  propose(d){if(d==="candidate_omission_high")return"broad_discovery_then_verify";if(d==="unknown_rejection_high")return"broad_discovery_with_targeted_followup";return null;}
  async optimize(){
    const baseline=await this.environment.evaluate(this.policies.direct_search),trials=[];
    let diagnosis=this.diagnose(baseline),reference=baseline;
    for(let step=0;step<2;step++){
      const intervention=this.propose(diagnosis); if(!intervention||trials.some(t=>t.intervention===intervention))break;
      const experiment=await this.environment.evaluate(this.policies[intervention]),decision=experiment.metrics.f1>baseline.metrics.f1?"KEEP":"REJECT";
      trials.push({diagnosis,hypothesis:`${intervention} improves F1`,intervention,experiment,decision});
      if(decision==="KEEP")break;
      reference=experiment; diagnosis=reference.failureAnalysis.unknownRejected.length?"unknown_rejection_high":this.diagnose(reference);
    }
    return{baseline,trials,selectedIntervention:trials.find(t=>t.decision==="KEEP")?.intervention??null,decision:trials.some(t=>t.decision==="KEEP")?"KEEP":"REJECT"};
  }
}
