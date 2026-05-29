/// <reference types="astro/client" />

declare module 'mdx/types' {
  interface MDXProvidedComponents {
    Ref: (props: {
      id: RegistryId;
      altLabel?: string;
      useTitle?: boolean;
      useEnvNum?: boolean;
      short?: boolean;
      textTransform?: 'lowercase' | 'uppercase' | 'capitalize';
    }) => import('react').ReactElement | null;
  }
}
