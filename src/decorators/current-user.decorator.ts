import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest } from 'src/auth/guards/auth.guard';

export const CurrentUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext) =>
        ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);