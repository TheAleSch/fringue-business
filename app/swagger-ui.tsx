'use client';

import dynamic from 'next/dynamic';
import type SwaggerUIType from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import { openApiSpec } from '@/lib/openapi';

type SwaggerUIProps = React.ComponentProps<typeof SwaggerUIType>;

const SwaggerUI = dynamic<SwaggerUIProps>(() => import('swagger-ui-react'), { ssr: false });

export default function SwaggerDocs() {
  return (
    <SwaggerUI
      spec={openApiSpec}
      deepLinking={true}
      defaultModelsExpandDepth={1}
      defaultModelExpandDepth={1}
    />
  );
}
