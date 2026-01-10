import { Injectable } from "@nestjs/common";
import { UTApi } from "uploadthing/server";

@Injectable()
export class StorageService {
  private utapi: UTApi;

  constructor() {
    this.utapi = new UTApi();
  }

  async uploadFiles(files: File[]) {
    const response = await this.utapi.uploadFiles(files);
    return response;
  }

  async deleteFiles(keys: string[]) {
    await this.utapi.deleteFiles(keys);
  }

  async getFileUrls(keys: string[]) {
    const urls = await this.utapi.getFileUrls(keys);
    return urls;
  }
}
