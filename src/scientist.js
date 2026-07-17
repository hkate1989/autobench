const allowed=["broad_discovery_then_verify","broad_discovery_with_targeted_followup"];

export class LLMScientist {
  constructor({apiKey=process.env.OPENAI_API_KEY,model=process.env.OPENAI_MODEL||"gpt-5.6-luna"}={}){this.apiKey=apiKey;this.model=model;}
  async propose(result,fallback){
    if(!this.apiKey)return{source:"deterministic_fallback",...fallback};
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{authorization:`Bearer ${this.apiKey}`,"content-type":"application/json"},body:JSON.stringify({
      model:this.model,
      instructions:"You diagnose one benchmark result. Choose exactly one allowed intervention. Do not invent keys or code.",
      input:JSON.stringify({result,allowedInterventions:allowed}),
      text:{format:{type:"json_schema",name:"research_hypothesis",strict:true,schema:{type:"object",additionalProperties:false,properties:{pattern:{type:"string"},hypothesis:{type:"string"},intervention:{type:"string",enum:allowed}},required:["pattern","hypothesis","intervention"]}}}
    })});
    if(!response.ok)return{source:"deterministic_fallback",error:`OpenAI ${response.status}`,...fallback};
    const json=await response.json(),text=json.output?.flatMap(x=>x.content||[]).find(x=>x.type==="output_text")?.text;
    try{const proposal=JSON.parse(text);if(!allowed.includes(proposal.intervention))throw Error("not allowed");return{source:"llm",...proposal};}catch{return{source:"deterministic_fallback",error:"invalid structured response",...fallback};}
  }
}
