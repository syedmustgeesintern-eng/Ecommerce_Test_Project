import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles/roles.decorator';
import { Role } from '../enums/role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

     console.log('🔐 Required Roles:', requiredRoles);
     if (!requiredRoles) return true;
     
     const request = context.switchToHttp().getRequest();
     const user = request.user;
     console.log('👤 User from token:', user);
  const hasRole = requiredRoles.includes(user.role);

  console.log('🎯 Has required role?', hasRole);
    if (!user || !user.role) {
      return false;
    }

    return requiredRoles.includes(user.role);
  }
}
