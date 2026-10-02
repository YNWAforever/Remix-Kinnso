import process from 'node:process';
import console from 'node:console';
import {URL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const target={project:'kinnsoos-b1-20261002',container:'supabase_db_kinnsoos-b1-20261002',url:'http://127.0.0.1:58421'};
if(process.env.KINNSO_TEST_TARGET!=='local'||process.env.KINNSO_TEST_PROJECT!==target.project||process.env.SUPABASE_URL!==target.url||process.env.SUPABASE_DB_CONTAINER!==target.container)throw new Error('BLOCKED: local schema generation target is not approved');
const inspect=JSON.parse(execFileSync('docker',['inspect',target.container],{encoding:'utf8'}))[0];
if(inspect.Config.Labels['com.supabase.cli.project']!==target.project)throw new Error('BLOCKED: container identity mismatch');
const cli=fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js',import.meta.url));
const workdir=fileURLToPath(new URL('../../local-stack',import.meta.url));
let output=execFileSync(process.execPath,[cli,'gen','types','typescript','--local','--workdir',workdir],{cwd:root,encoding:'utf8',maxBuffer:10*1024*1024});
if(!output.includes('export type Database ='))throw new Error('Invalid type generation result');
// The CLI omits RPC argument nullability. Recover explicitly nullable SQL defaults
// from this same local schema rather than hand-editing a generated type dump.
const definitions=JSON.parse(execFileSync('docker',['exec',target.container,'psql','-U','postgres','-d','postgres','-Atc',"select coalesce(json_agg(json_build_object('name',proname,'args',pg_get_function_arguments(oid))),'[]'::json) from pg_proc where pronamespace='public'::regnamespace and pg_get_function_arguments(oid) like '%DEFAULT NULL%'"],{encoding:'utf8'}));
const nullable=new Map(definitions.map(def=>[def.name,Array.from(def.args.matchAll(/\b(p_\w+)\s+[^,]*DEFAULT NULL\b/g),match=>match[1])]));
output=output.replace(/^( {6}(\w+): \{\n)([\s\S]*?)(^ {6}\})/gm,(whole,start,name,body,end)=>{
 for(const arg of nullable.get(name)??[])body=body.replace(new RegExp('(\\b'+arg+'\\??:\\s*)(string(?:\\[\\])?|number|boolean|Json)(?!\\s*\\| null)','g'),'$1$2 | null');
 return start+body+end;
});
output=output.replace(/^ {6}(\w+): (\{[^\n]+\})$/gm,(whole,name,body)=>{
 for(const arg of nullable.get(name)??[])body=body.replace(new RegExp('(\\b'+arg+'\\??:\\s*)(string(?:\\[\\])?|number|boolean|Json)(?!\\s*\\| null)','g'),'$1$2 | null');
 return '      '+name+': '+body;
});
writeFileSync(new URL('../packages/db/types.ts',import.meta.url),output.trimEnd()+'\n');
console.log('Private database types generated from the verified local migration head.');
