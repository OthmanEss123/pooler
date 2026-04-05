import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { UnsubscribeService } from './unsubscribe.service';

@Controller('unsubscribe')
export class UnsubscribeController {
  constructor(private readonly unsubscribeService: UnsubscribeService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async unsubscribe(@Query('token') token: string, @Res() res: Response) {
    try {
      const result = await this.unsubscribeService.processUnsubscribe(token);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`
        <!DOCTYPE html>
        <html lang="fr">
        <head><meta charset="utf-8"><title>Desabonnement</title>
        <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5}
        .card{background:#fff;padding:40px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1);text-align:center;max-width:400px}
        h1{color:#333;font-size:24px}p{color:#666;font-size:14px}</style></head>
        <body><div class="card">
        <h1>Desabonnement confirme</h1>
        <p>${result.email} a ete retire de notre liste.</p>
        </div></body></html>
      `);
    } catch {
      res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`
        <!DOCTYPE html>
        <html lang="fr">
        <head><meta charset="utf-8"><title>Erreur</title>
        <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5}
        .card{background:#fff;padding:40px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1);text-align:center;max-width:400px}
        h1{color:#c00;font-size:24px}p{color:#666;font-size:14px}</style></head>
        <body><div class="card">
        <h1>Lien invalide</h1>
        <p>Ce lien de desabonnement est invalide ou a expire.</p>
        </div></body></html>
      `);
    }
  }
}
