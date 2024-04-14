import { Controller, Get } from '@nestjs/common';
import { StagesService } from './stages.service';

@Controller('stages')
export class StagesController {
  constructor(private readonly stagesService: StagesService) {}

  @Get()
  async getAllStages() {
    return this.stagesService.getAll();
  }

  @Get('group')
  async getAllgroups() {
    return this.stagesService.getGroups();
  }

  @Get('sync')
  async syncStagesAndGroups() {
    return this.stagesService.sync();
  }
}
