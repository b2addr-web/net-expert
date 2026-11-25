import assert from 'node:assert/strict';
import test from 'node:test';
import {isOwnerPortalHost,ownerLoginAddress,ownerPortalEnabled} from '../lib/owner-portal-host.js';

test('owner sign-in uses a separate Gmail identity without changing other addresses', () => {
 assert.equal(ownerLoginAddress(' Owner.Sample@GMAIL.COM '),'owner.sample+netexpert-owner@gmail.com');
 assert.equal(ownerLoginAddress('owner.sample+netexpert-owner@gmail.com'),'owner.sample+netexpert-owner@gmail.com');
 assert.equal(ownerLoginAddress('qa@example.test'),'qa@example.test');
});

test('the owner portal is separated from company and deployment hosts in production', () => {
 const original=process.env.VERCEL_ENV;
 try {
  process.env.VERCEL_ENV='production';
  assert.equal(ownerPortalEnabled('admin.netexpert.dev'),true);
  assert.equal(ownerPortalEnabled('www.netexpert.dev'),false);
  assert.equal(ownerPortalEnabled('netexpert.dev'),false);
  assert.equal(ownerPortalEnabled('net-expert-test.vercel.app'),false);
  assert.equal(isOwnerPortalHost('ADMIN.NETEXPERT.DEV:443'),true);
  assert.equal(isOwnerPortalHost('admin.netexpert.dev.example.test'),false);
 } finally {
  if(original===undefined)delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV=original;
 }
});

test('preview access requires the explicitly configured isolated project', () => {
 const keys=['VERCEL_ENV','INTAKE_PREVIEW_SUPABASE_REF','NEXT_PUBLIC_SUPABASE_URL'];
 const original=keys.map(key=>process.env[key]);
 const ref='abcdefghijklmnopqrst';
 try {
  process.env.VERCEL_ENV='preview';
  process.env.INTAKE_PREVIEW_SUPABASE_REF=ref;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.equal(ownerPortalEnabled('example.vercel.app'),false);
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://'+ref+'.supabase.co';
  assert.equal(ownerPortalEnabled('example.vercel.app'),true);
  process.env.INTAKE_PREVIEW_SUPABASE_REF='uycntpxrfbqtxydhsbbi';
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://uycntpxrfbqtxydhsbbi.supabase.co';
  assert.equal(ownerPortalEnabled('example.vercel.app'),false);
 } finally {
  keys.forEach((key,i)=>{
   if(original[i]===undefined)delete process.env[key];
   else process.env[key]=original[i];
  });
 }
});
