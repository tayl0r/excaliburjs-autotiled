export interface SavedMap {
  version: 1;
  name: string;
  wangSetName: string;
  width: number;
  height: number;
  colors: number[];  // flat row-major, length = width * height
}
