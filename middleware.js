import {NextResponse} from 'next/server';
import {isOwnerPortalHost} from './lib/owner-portal-host';

export function middleware(request) {
 if (!isOwnerPortalHost(request.headers.get('host'))) return NextResponse.next();
 const {pathname}=request.nextUrl;
 if (pathname==='/') {
  const target=request.nextUrl.clone();
  target.pathname='/admin';
  return NextResponse.rewrite(target);
 }
 if (pathname==='/admin'||pathname==='/api/platform/owner'||pathname.startsWith('/_next/')) return NextResponse.next();
 return new NextResponse('Not found',{status:404});
}

export const config={matcher:'/((?!_next/static|_next/image).*)'};
