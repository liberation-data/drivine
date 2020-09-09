import { LocalStorage } from "./LocalStorage";
import { LocalStorageAls } from "./LocalStorageAls";
import { LocalStorageClsHooked } from "./LocalStorageClsHooked";

function isAlsSupported(): boolean {
    const [nodeMajor, nodeMinor] = process.versions.node.split('.');

    const major = Number.parseInt(nodeMajor);
    const minor = Number.parseInt(nodeMinor);

    if (major === 12 && minor >= 17) {
        return true;
    }

    if (major === 13 && minor >= 10) {
        return true;
    }

    return major > 13;
}


export function MakeLocalStorage(): LocalStorage {
    if (isAlsSupported()) {
        return new LocalStorageAls();
    } else {
        return new LocalStorageClsHooked();
    }
}