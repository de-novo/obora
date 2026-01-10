import { Controller, Post, Delete, Body } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { StorageService } from "./storage.service.js";

@ApiTags("Storage")
@Controller("storage")
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Delete("files")
  @ApiOperation({ summary: "Delete files" })
  async deleteFiles(@Body() body: { keys: string[] }) {
    await this.storageService.deleteFiles(body.keys);
    return { success: true };
  }
}
