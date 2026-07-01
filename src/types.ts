export interface CodeTab {
  id: string;
  name: string;
  code: string;
  kind?: 'code' | 'docs';
  isDirty?: boolean;
  _id?: string;
  path?: string;
}
