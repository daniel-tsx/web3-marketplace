import { Buffer } from 'buffer';

// SPL Token's browser bundle reads Buffer while its modules initialize.
(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;
void import('./bootstrap');
