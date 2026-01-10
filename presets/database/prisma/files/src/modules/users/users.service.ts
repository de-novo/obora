import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../db/prisma.service.js";
import { Prisma, User } from "../../generated/prisma/client";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<User[]> {
    return this.prisma.user.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({
      data,
    });
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    const user = await this.findOne(id);

    return this.prisma.user.update({
      where: { id: user.id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    const user = await this.findOne(id);

    await this.prisma.user.delete({
      where: { id: user.id },
    });
  }
}
