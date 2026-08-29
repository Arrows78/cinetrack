mod benchmark;
mod fixtures;
mod memory;
mod query_plans;
mod report;

#[tokio::test]
#[ignore = "manual scalability benchmark; run with `pnpm perf:database`"]
async fn benchmark_library_progress_and_stats_at_1k_10k_and_50k_scale() {
    benchmark::run().await;
}
