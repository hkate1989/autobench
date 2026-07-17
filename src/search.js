import { mkdir,readFile,writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const endpoint="https://en.wikipedia.org/w/api.php";
export class WikipediaSearch {
  constructor({cacheDir="data/cache",live=true}={}) { this.cacheDir=cacheDir; this.live=live; }
  async search(query,limit=10) {
    const key=createHash("sha256").update(`${query}:${limit}`).digest("hex").slice(0,16), file=path.join(this.cacheDir,`${key}.json`);
    try { return JSON.parse(await readFile(file,"utf8")); } catch(e) { if(e.code!=="ENOENT") throw e; if(!this.live) throw new Error(`Missing replay cache: ${query}`); }
    const url=new URL(endpoint); url.search=new URLSearchParams({action:"query",list:"search",srsearch:query,srlimit:String(limit),format:"json",origin:"*",utf8:"1"});
    let response;
    for(let attempt=0;attempt<7;attempt++){
      await new Promise(resolve=>setTimeout(resolve,750));
      response=await fetch(url,{headers:{"user-agent":"AutoBench/0.1 (reproducible research benchmark; contact via github.com/hkate1989/autobench)"}});
      if(response.status!==429)break;
      await new Promise(resolve=>setTimeout(resolve,1500*(attempt+1)));
    }
    if(!response.ok) throw new Error(`Wikipedia search failed: ${response.status}`);
    const json=await response.json(); const result={query,fetchedAt:new Date().toISOString(),results:json.query.search.map(({title,snippet})=>({title,snippet:snippet.replace(/<[^>]+>/g," ").replace(/&quot;/g,'"')}))};
    await mkdir(this.cacheDir,{recursive:true}); await writeFile(file,`${JSON.stringify(result,null,2)}\n`); return result;
  }
}
