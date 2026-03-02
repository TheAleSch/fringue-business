import SwaggerDocs from './swagger-ui';
import { partnerApiSpec } from '@/lib/openapi';

export default function Home() {
  return (
    <>
      <div style={{ padding: '8px 16px', background: '#f8f8f8', borderBottom: '1px solid #e0e0e0', textAlign: 'right' }}>
        <a href="/api/openapi/partner" download="fringue-partner-api.json" style={{ fontSize: 13, color: '#3b82f6' }}>
          ↓ Download OpenAPI spec
        </a>
      </div>
      <SwaggerDocs spec={partnerApiSpec} />
    </>
  );
}
