import { Matches } from 'class-validator';

export class UpdateShippingFeeDto {
  @Matches(/^\d{1,10}(\.\d{1,2})?$/, {
    message:
      'shippingFee must be a non-negative number with up to 2 decimal places',
  })
  shippingFee: string;
}
