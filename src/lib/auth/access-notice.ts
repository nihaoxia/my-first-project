export type AccessNotice = {
  tone: "warning";
  title: string;
  message: string;
};

export function getLibraryAccessNotice(error: string | undefined): AccessNotice | null {
  if (error !== "admin") {
    return null;
  }

  return {
    tone: "warning",
    title: "需要管理员权限",
    message: "当前账号没有后台访问权限，已返回私人书架。",
  };
}
