// Kiểu cho cpuLimit.mjs (file .mjs chạy thẳng bằng node trước khi đóng gói).

export declare const MACHINE_SHARE: number
/** ⌊số luồng × MACHINE_SHARE / hệ số turbo⌋, tối thiểu 1, tối đa 64. */
export declare function sharedThreadCount(threadCount: number, boost?: number): number
/** Hệ số turbo dùng để tính trên Windows: số đọc được nhưng không dưới 1,7. */
export declare function windowsBoost(measured: number): number
/** Mask affinity của `count` luồng đầu. */
export declare function affinityMask(count: number): bigint
/** Ghim tiến trình vào phần CPU được dùng; trả số luồng được dùng và câu mô tả. */
export declare function limitCpu(): { threads: number; message: string }
