import { LocalStorageAls } from "./LocalStorageAls";
import {LocalStorage} from "@/utils/LocalStorage";

/**
 * Keep for backward compatibility
 */
export function MakeLocalStorage(): LocalStorage {
    return new LocalStorageAls();
}