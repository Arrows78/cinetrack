mod benchmark;
mod fixtures;
mod query_plans;
mod report;

#[tokio::test]
#[ignore = "manual scalability benchmark; run with `pnpm perf:database`"]
async fn benchmark_library_progress_and_stats_at_1k_and_10k_scale() {
    benchmark::run().await;
}
