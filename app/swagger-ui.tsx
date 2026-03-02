'use client';

import dynamic from 'next/dynamic';
import type SwaggerUIType from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

type SwaggerUIProps = React.ComponentProps<typeof SwaggerUIType>;

const SwaggerUI = dynamic<SwaggerUIProps>(() => import('swagger-ui-react'), { ssr: false });

export default function SwaggerDocs({ spec }: { spec: object }) {
  return (
    <SwaggerUI
      spec={spec}
      deepLinking={true}
      defaultModelsExpandDepth={1}
      defaultModelExpandDepth={1}
    />
  );
}
