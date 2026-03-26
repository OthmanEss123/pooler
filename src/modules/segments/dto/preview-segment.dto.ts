import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { SegmentConditionDto } from './segment-condition.dto';

export class PreviewSegmentDto {
  @ValidateNested()
  @Type(() => SegmentConditionDto)
  conditions!: SegmentConditionDto;
}
