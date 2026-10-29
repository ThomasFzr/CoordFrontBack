import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const contract=JSON.parse(readFileSync(new URL('../../docs/openapi.yaml',import.meta.url),'utf8'));
const ajv=new Ajv2020({strict:false,allErrors:true});
addFormats(ajv);
ajv.addSchema(contract,'medislot');

test('les réponses publiques respectent le contrat OpenAPI',async({request})=>{
 for(const [route,path] of [['/professionals?page=0&size=2','/professionals'],['/professionals/1','/professionals/{id}'],['/professionals/1/slots','/professionals/{id}/slots'],['/ab/assignment','/ab/assignment'],['/ab/metrics','/ab/metrics']]){
  const response=await request.get('/api'+route);
  expect(response.status()).toBe(200);
  const schema=contract.paths[path].get.responses['200'].content['application/json'].schema;
  const validate=ajv.compile({...schema,components:contract.components});
  const body=await response.json();
  expect(validate(body),JSON.stringify(validate.errors)).toBe(true);
 }
});
