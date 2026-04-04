import { IsString, IsUrl } from 'class-validator';

export class ConnectWooCommerceDto {
  @IsUrl(
    {
      require_tld: true,
      require_protocol: true,
    },
    {
      message: 'siteUrl doit etre une URL valide avec http:// ou https://',
    },
  )
  siteUrl!: string;

  @IsString()
  consumerKey!: string;

  @IsString()
  consumerSecret!: string;
}
