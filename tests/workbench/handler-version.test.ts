import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe,it,expect} from 'vitest';
import {WorkbenchClient} from '../../src/workbench/client.js';

describe('deployed handler version detection',()=>{
 it('accepts equivalent CRLF and LF deployments without replacing user files',()=>{
  const dir=mkdtempSync(join(tmpdir(),'enfusion-handler-test-'));
  const scripts=join(dir,'Scripts','WorkbenchGame','EnfusionMCP');
  try {
   const client=new WorkbenchClient('127.0.0.1',1);
   (client as any).installHandlerScripts(dir);
   for (const file of readdirSync(scripts)) {
    const path=join(scripts,file);
    const source=readFileSync(path,'utf8');
    writeFileSync(path,source.includes('\r\n') ? source.replace(/\r\n/g,'\n') : source.replace(/\n/g,'\r\n'));
   }
   writeFileSync(join(scripts,'custom.c'),'preserve me');
   expect(()=>(client as any).installHandlerScripts(dir)).not.toThrow();
   expect(readFileSync(join(scripts,'custom.c'),'utf8')).toBe('preserve me');
  } finally {rmSync(dir,{recursive:true,force:true});}
 });

 it('rejects stale Ping-only deployment without overwriting project files',()=>{
  const dir=mkdtempSync(join(tmpdir(),'enfusion-handler-test-'));
  const scripts=join(dir,'Scripts','WorkbenchGame','EnfusionMCP');mkdirSync(scripts,{recursive:true});
  writeFileSync(join(scripts,'EMCP_WB_Ping.c'),'user-owned old handler');
  writeFileSync(join(scripts,'custom.c'),'preserve me');
  try {
   const client=new WorkbenchClient('127.0.0.1',1);
   expect(()=>(client as any).installHandlerScripts(dir)).toThrow('differ from this MCP build');
   expect(readFileSync(join(scripts,'EMCP_WB_Ping.c'),'utf8')).toBe('user-owned old handler');
   expect(readFileSync(join(scripts,'custom.c'),'utf8')).toBe('preserve me');
  } finally {rmSync(dir,{recursive:true,force:true});}
 });
});
