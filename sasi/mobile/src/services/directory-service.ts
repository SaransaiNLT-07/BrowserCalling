import type { ApiClient } from "@/services/api-client";
import type { Page, PublicUser } from "@/types/models";

export class DirectoryService {
  constructor(private readonly api: ApiClient) {}

  list(query = ""): Promise<Page<PublicUser>> {
    const params = new URLSearchParams({ page_size: "50" });
    if (query.trim()) params.set("q", query.trim());
    return this.api.request<Page<PublicUser>>(`/users/?${params.toString()}`);
  }
}
