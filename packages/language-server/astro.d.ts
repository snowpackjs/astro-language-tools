export {};

declare global {
  interface ImportMeta {
      hot: {
          accept: Function;
          dispose: Function;
      };
      env: Record<string, string>;
  }
}

type AstroRenderedHTML = string;

type FetchContentResultBase = {
  astro: {
    headers: string[];
    source: string;
    html: AstroRenderedHTML;
  };
  url: URL;
};

type FetchContentResult<T> = FetchContentResultBase & T;

export type Params = Record<string, string | undefined>;

interface AstroPageRequest {
  url: URL;
  canonicalURL: URL;
  params: Params;
}

interface AstroBuiltinProps {
  'client:load'?: boolean;
  'client:idle'?: boolean;
  'client:media'?: string;
  'client:visible'?: boolean;
}

interface Astro {
  isPage: boolean;
  fetchContent<T = any>(globStr: string): FetchContentResult<T>[];
  props: Record<string, number | string | any>;
  request: AstroPageRequest;
  resolve: (path: string) => string;
  site: URL;
}

declare const Astro: Astro;