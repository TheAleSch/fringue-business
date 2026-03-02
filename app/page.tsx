import SwaggerDocs from './swagger-ui';
import { partnerApiSpec } from '@/lib/openapi';

export default function Home() {
  return <SwaggerDocs spec={partnerApiSpec} />;
}
