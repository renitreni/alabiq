// Execute the repository's migration checker against disposable PostgreSQL.
// This adapter covers its SQL reads, zero-UUID updates and named RPCs.
// It does NOT claim to test the Supabase HTTP/PostgREST/Auth/Storage services.
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
module.exports=async function runMigrationContract(rawSql){
  const quote=v=>v===null?'null':typeof v==='boolean'||typeof v==='number'?String(v):"'"+String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")+"'";
  const ident=s=>'"'+s.replaceAll('"','""')+'"';
  const execute=(role,q)=>{
    try{
      const output=rawSql("\\set VERBOSITY verbose\nset role "+role+";\n"+q);
      return {data:output?JSON.parse(output):null,error:null};
    }catch(e){
      const message=e.stderr?.toString()||e.message;
      return {data:null,error:{message,code:message.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1]}};
    }
  };
  const client=role=>({
    from(table){
      const state={cols:'*',filters:[],max:null,patch:null,single:false};
      const builder={
        select(cols){state.cols=cols;return this;},
        update(patch){state.patch=patch;return this;},
        eq(col,value){state.filters.push(ident(col)+'='+quote(value));return this;},
        limit(n){state.max=n;return this;},
        maybeSingle(){state.single=true;return this;},
        then(resolve,reject){
          let q;
          const where=state.filters.length?' where '+state.filters.join(' and '):'';
          if(state.patch){
            q='update public.'+ident(table)+' set '+Object.entries(state.patch).map(([k,v])=>ident(k)+'='+quote(v)).join(',')+where+';';
            return Promise.resolve(execute(role,q)).then(resolve,reject);
          }
          q='select coalesce(json_agg(r),'+quote([])+'::json) from (select '+state.cols+' from public.'+ident(table)+where+(state.max!==null?' limit '+state.max:'')+') r;';
          const r=execute(role,q);if(state.single&&!r.error)r.data=r.data[0]||null;
          return Promise.resolve(r).then(resolve,reject);
        }
      };
      return builder;
    },
    rpc(name,args){
      return Promise.resolve(execute(role,'select to_json(public.'+ident(name)+'('+Object.entries(args||{}).map(([k,v])=>ident(k)+'=>'+quote(v)).join(',')+'));'));
    }
  });
  const messages=[];
  const sandbox={
    console:{log:(...args)=>messages.push(args.join(' ')),error:(...args)=>messages.push(args.join(' '))},
    process:{env:{SUPABASE_ANON_KEY:'local-test',SUPABASE_URL:'local-test'},exit:code=>{throw Error('Migration checker exit '+code);}},
    require:name=>{
      if(name==='dotenv')return {config(){}};
      if(name==='ws')return class {};
      if(name==='@supabase/supabase-js')return {createClient:()=>client('anon')};
      if(name==='../lib/supabase')return {supabase:client('service_role')};
      throw Error('Unexpected import '+name);
    }
  };
  let source=fs.readFileSync(path.join(__dirname,'../../../scripts/check-migrations.js'),'utf8');
  source=source.replace('main().catch','globalThis.completion = main().catch');
  vm.runInNewContext(source,sandbox,{filename:'check-migrations.js'});
  await sandbox.completion;
  const failures=messages.filter(x=>x.includes('[FAIL]')||x.includes('[SKIP]')||x.includes('check-migrations failed'));
  if(failures.length)throw Error(messages.join('\n'));
  const passed=messages.filter(x=>x.includes('[OK]')).length;
  if(passed<40)throw Error('Unexpected checker coverage: '+passed);
  return passed;
};

