import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma/prisma.service';
import { QuotaService } from '../billing/quota.service';
import { ContactsImportService } from './contacts-import.service';

const mockPrisma = {
  contact: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
  },
};

const mockQuota = {
  checkContactLimit: jest.fn(),
};

describe('ContactsImportService', () => {
  let service: ContactsImportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsImportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QuotaService, useValue: mockQuota },
      ],
    }).compile();

    service = module.get(ContactsImportService);
    jest.clearAllMocks();
  });

  describe('parseCsv()', () => {
    it('rejects when the email column is missing', async () => {
      const buffer = Buffer.from('firstName,lastName\nJean,Dupont\n');

      await expect(service.parseCsv(buffer)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('parses a valid CSV', async () => {
      const buffer = Buffer.from(
        'email,firstName,lastName\n' + 'jean@test.com,Jean,Dupont\n',
      );

      const { contacts, errors } = await service.parseCsv(buffer);
      expect(contacts).toHaveLength(1);
      expect(contacts[0].email).toBe('jean@test.com');
      expect(errors).toHaveLength(0);
    });

    it('skips rows with invalid emails', async () => {
      const buffer = Buffer.from(
        'email,firstName\n' + 'invalid,Jean\n' + 'valid@test.com,Marie\n',
      );

      const { contacts, errors } = await service.parseCsv(buffer);
      expect(contacts).toHaveLength(1);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('invalid');
    });

    it('parses tags into an array', async () => {
      const buffer = Buffer.from('email,tags\njean@test.com,"vip,actif"\n');

      const { contacts } = await service.parseCsv(buffer);
      expect(contacts[0].tags).toEqual(['vip', 'actif']);
    });

    it('strips the UTF-8 BOM', async () => {
      const bom = Buffer.from([0xef, 0xbb, 0xbf]);
      const content = Buffer.from('email\njean@test.com\n');
      const buffer = Buffer.concat([bom, content]);

      const { contacts } = await service.parseCsv(buffer);
      expect(contacts).toHaveLength(1);
    });
  });

  describe('importFromCsv()', () => {
    it('fills missing fields only', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([
        {
          id: 'c1',
          email: 'jean@test.com',
          firstName: 'Original',
          lastName: null,
          phone: null,
          sourceChannel: null,
          properties: {},
        },
      ]);

      const buffer = Buffer.from('email,firstName\njean@test.com,Nouveau\n');

      await service.importFromCsv('tenant-1', buffer);

      expect(mockPrisma.contact.update).not.toHaveBeenCalled();
    });

    it('propagates parsing errors', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([]);
      mockPrisma.contact.createMany.mockResolvedValue({ count: 1 });
      mockQuota.checkContactLimit.mockResolvedValue(undefined);

      const buffer = Buffer.from(
        'email,firstName\n' + 'invalid,Jean\n' + 'valid@test.com,Marie\n',
      );

      const result = await service.importFromCsv('tenant-1', buffer);

      expect(result.errors).toHaveLength(1);
      expect(result.skipped).toBe(1);
    });
  });
});
