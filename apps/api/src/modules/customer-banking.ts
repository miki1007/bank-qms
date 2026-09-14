import {
  Controller,
  Get,
  Inject,
  Injectable,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { CustomerBankAccount } from "@prisma/client";
import type { Response } from "express";
import { PrismaService } from "../prisma.service";
import { CurrentCustomer, CustomerJwtAuthGuard } from "./customer-auth";

type CustomerIdentity = {
  sub: string;
};

type AccountSeed = {
  accountType: "CHECKING" | "SAVINGS";
  name: string;
  maskedNumber: string;
  ledgerBalanceMinor: bigint;
  availableBalanceMinor: bigint;
};

const ACCOUNT_SEEDS: AccountSeed[] = [
  {
    accountType: "CHECKING",
    name: "Everyday Account",
    maskedNumber: "•••• 1842",
    ledgerBalanceMinor: 6100935n,
    availableBalanceMinor: 6100935n,
  },
  {
    accountType: "SAVINGS",
    name: "Savings Account",
    maskedNumber: "•••• 6407",
    ledgerBalanceMinor: 12540050n,
    availableBalanceMinor: 12540050n,
  },
];

const daysAgo = (days: number, hour = 10) => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - days);
  value.setUTCHours(hour, 0, 0, 0);
  return value;
};

const minorToNumber = (value: bigint) => Number(value);

const csvCell = (value: string | number) => {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

@Injectable()
export class CustomerBankingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async ensurePortfolio(customerId: string) {
    await this.prisma.$transaction(async (tx) => {
      const accounts: CustomerBankAccount[] = [];
      for (const seed of ACCOUNT_SEEDS) {
        const account = await tx.customerBankAccount.upsert({
          where: {
            customerId_accountType: {
              customerId,
              accountType: seed.accountType,
            },
          },
          update: {
            name: seed.name,
            maskedNumber: seed.maskedNumber,
            currency: "ETB",
            status: "ACTIVE",
          },
          create: {
            customerId,
            currency: "ETB",
            status: "ACTIVE",
            ...seed,
          },
        });
        accounts.push(account);
      }

      const checking = accounts.find(
        (account) => account.accountType === "CHECKING",
      );
      const savings = accounts.find(
        (account) => account.accountType === "SAVINGS",
      );
      if (!checking || !savings) return;

      await tx.customerBankTransaction.createMany({
        skipDuplicates: true,
        data: [
          {
            accountId: checking.id,
            postedAt: daysAgo(1, 14),
            description: "Addis Market",
            category: "Shopping",
            amountMinor: -184520n,
            balanceMinor: 6100935n,
            reference: `${customerId}-checking-market`,
          },
          {
            accountId: checking.id,
            postedAt: daysAgo(2, 8),
            description: "Salary deposit",
            category: "Income",
            amountMinor: 4500000n,
            balanceMinor: 6285455n,
            reference: `${customerId}-checking-salary`,
          },
          {
            accountId: checking.id,
            postedAt: daysAgo(4, 17),
            description: "Ethio telecom",
            category: "Utilities",
            amountMinor: -98000n,
            balanceMinor: 1785455n,
            reference: `${customerId}-checking-telecom`,
          },
          {
            accountId: checking.id,
            postedAt: daysAgo(6, 12),
            description: "Fuel station",
            category: "Transport",
            amountMinor: -245000n,
            balanceMinor: 1883455n,
            reference: `${customerId}-checking-fuel`,
          },
          {
            accountId: checking.id,
            postedAt: daysAgo(8, 9),
            description: "Coffee house",
            category: "Dining",
            amountMinor: -7650n,
            balanceMinor: 2128455n,
            reference: `${customerId}-checking-coffee`,
          },
          {
            accountId: checking.id,
            postedAt: daysAgo(12, 7),
            description: "Mobile transfer received",
            category: "Transfer",
            amountMinor: 300000n,
            balanceMinor: 2136105n,
            reference: `${customerId}-checking-transfer`,
          },
          {
            accountId: savings.id,
            postedAt: daysAgo(3, 11),
            description: "Monthly savings transfer",
            category: "Transfer",
            amountMinor: 2500000n,
            balanceMinor: 12540050n,
            reference: `${customerId}-savings-transfer`,
          },
          {
            accountId: savings.id,
            postedAt: daysAgo(18, 11),
            description: "Savings interest",
            category: "Interest",
            amountMinor: 140050n,
            balanceMinor: 10040050n,
            reference: `${customerId}-savings-interest`,
          },
        ],
      });
    });
  }

  async portfolio(customerId: string) {
    await this.ensurePortfolio(customerId);
    const accounts = await this.prisma.customerBankAccount.findMany({
      where: { customerId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      include: {
        transactions: {
          where: { status: "POSTED" },
          orderBy: { postedAt: "desc" },
          take: 8,
        },
      },
    });

    const transactions = accounts
      .flatMap((account) =>
        account.transactions.map((transaction) => ({
          id: transaction.id,
          accountId: account.id,
          accountName: account.name,
          maskedNumber: account.maskedNumber,
          postedAt: transaction.postedAt.toISOString(),
          description: transaction.description,
          category: transaction.category,
          amountMinor: minorToNumber(transaction.amountMinor),
          balanceMinor: minorToNumber(transaction.balanceMinor),
          status: transaction.status,
        })),
      )
      .sort((left, right) => right.postedAt.localeCompare(left.postedAt))
      .slice(0, 12);

    return {
      currency: accounts[0]?.currency ?? "ETB",
      totalAvailableMinor: accounts.reduce(
        (total, account) =>
          total + minorToNumber(account.availableBalanceMinor),
        0,
      ),
      accounts: accounts.map((account) => ({
        id: account.id,
        accountType: account.accountType,
        name: account.name,
        maskedNumber: account.maskedNumber,
        currency: account.currency,
        ledgerBalanceMinor: minorToNumber(account.ledgerBalanceMinor),
        availableBalanceMinor: minorToNumber(account.availableBalanceMinor),
        status: account.status,
      })),
      transactions,
    };
  }

  async statement(customerId: string, accountId?: string) {
    await this.ensurePortfolio(customerId);
    const accounts = await this.prisma.customerBankAccount.findMany({
      where: {
        customerId,
        status: "ACTIVE",
        ...(accountId ? { id: accountId } : {}),
      },
      include: {
        transactions: {
          orderBy: { postedAt: "desc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const rows = [
      [
        "Date",
        "Account",
        "Account number",
        "Description",
        "Category",
        "Amount ETB",
        "Balance ETB",
        "Status",
        "Reference",
      ],
      ...accounts.flatMap((account) =>
        account.transactions.map((transaction) => [
          transaction.postedAt.toISOString(),
          account.name,
          account.maskedNumber,
          transaction.description,
          transaction.category,
          (Number(transaction.amountMinor) / 100).toFixed(2),
          (Number(transaction.balanceMinor) / 100).toFixed(2),
          transaction.status,
          transaction.reference,
        ]),
      ),
    ];

    return rows.map((row) => row.map(csvCell).join(",")).join("\n");
  }
}

@Controller("customers/me")
@UseGuards(CustomerJwtAuthGuard)
export class CustomerBankingController {
  constructor(
    @Inject(CustomerBankingService)
    private readonly banking: CustomerBankingService,
  ) {}

  @Get("portfolio")
  portfolio(@CurrentCustomer() customer: CustomerIdentity) {
    return this.banking.portfolio(customer.sub);
  }

  @Get("statement.csv")
  async statement(
    @CurrentCustomer() customer: CustomerIdentity,
    @Query("accountId") accountId: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const csv = await this.banking.statement(customer.sub, accountId);
    response.type("text/csv");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="worldlink-statement-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    );
    return csv;
  }
}
