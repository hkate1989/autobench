import http from"node:http";import{readFile}from"node:fs/promises";import path from"node:path";import{fileURLToPath}from"node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const routes={"/":"public/index.html","/app.js":"public/app.js","/styles.css":"public/styles.css","/api/task-a":"data/experiments/task-a.json","/api/task-b":"data/experiments/task-b.json"};
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json"};
const port=process.env.PORT||4173,host="127.0.0.1";
http.createServer(async(req,res)=>{try{const rel=routes[new URL(req.url,"http://localhost").pathname];if(!rel){res.writeHead(404);return res.end("Not found");}const file=path.join(root,rel);res.writeHead(200,{"content-type":types[path.extname(file)]});res.end(await readFile(file));}catch(e){res.writeHead(500);res.end(e.message);}}).listen(port,host,()=>console.log(`AutoBench replay: http://${host}:${port}`));
