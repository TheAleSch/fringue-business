import SwaggerDocs from '../swagger-ui';
import { adminApiSpec } from '@/lib/openapi';

export default function AdminDocs() {
  return <SwaggerDocs spec={adminApiSpec} />;
}
