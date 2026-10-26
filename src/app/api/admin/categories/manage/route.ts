import { route } from "@/server/route";
import { HttpError } from "@/server/httpError";
import { categoryService } from "@/server/modules/categories/category.service";

// Kitchen staff need the category list for the menu items screen; only admins may change it.
export const POST = route(
  ({ body, user }) => {
    if (body?.action !== "list" && !user?.roles.includes("admin")) {
      throw new HttpError(403, "Insufficient permissions");
    }
    return categoryService.manage(body, user!);
  },
  { roles: ["admin", "kitchen"] },
);
