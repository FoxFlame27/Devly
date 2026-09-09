export type PublishResult = { url: string; slug: string };

export interface HostingProvider {
  readonly name: string;
  /** Uploads a built static site and returns its public URL. */
  publish(projectId: string, buildDir: string, slug: string): Promise<PublishResult>;
  unpublish(slug: string): Promise<void>;
  /** The base path the site will be served from (used as the build's base path). */
  basePath(slug: string): string;
}
