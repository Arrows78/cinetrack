use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsTotals {
    pub movies_watched: i64,
    pub episodes_watched: i64,
    pub minutes_watched: i64,
    /// Minutes from movie-typed events only — the movies/series split card
    /// on the Stats page reads this alongside `episode_minutes_watched`
    /// instead of re-deriving it from a second, unbounded events fetch.
    pub movie_minutes_watched: i64,
    pub episode_minutes_watched: i64,
    pub completed_series: i64,
    pub library_completion_percent: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyActivityBucket {
    pub month: String,
    pub count: i64,
    pub minutes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsOverview {
    pub totals: StatsTotals,
    pub monthly_activity: Vec<MonthlyActivityBucket>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YearlyActivityBucket {
    pub year: i64,
    pub movies_watched: i64,
    pub episodes_watched: i64,
    pub minutes_watched: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitleRating {
    pub title: String,
    pub rating: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BiggestBingeDay {
    pub day: String,
    pub count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyRecap {
    pub month: String,
    // Historical breakdown: count every watched/rewatched event that fell in
    // the month instead of deduping to the latest state of each title.
    pub movies_watched: i64,
    pub episodes_watched: i64,
    pub minutes_watched: i64,
    pub top_rated_title: Option<TitleRating>,
    pub favourite_genre: Option<String>,
    pub biggest_binge_day: Option<BiggestBingeDay>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComfortTitle {
    pub title: String,
    pub count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RewatchStats {
    pub total_rewatches: i64,
    /// Rewatches as a percentage of every watch event (`watched` +
    /// `rewatched`), rounded to the nearest whole percent.
    pub rewatch_share_percent: i64,
    pub favourite_comfort_titles: Vec<ComfortTitle>,
    pub rewatch_activity: Vec<MonthlyActivityBucket>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RatingBucket {
    pub rating: f64,
    pub count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RatingPeriodAverage {
    pub period: String,
    pub average: f64,
    pub count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RatingDistribution {
    // Current-state: user_rating is one mutable value per title.
    pub distribution: Vec<RatingBucket>,
    // Historical watch periods using the title's current rating value.
    pub average_by_month: Vec<RatingPeriodAverage>,
    pub average_by_year: Vec<RatingPeriodAverage>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MilestoneCategory {
    Episodes,
    Movies,
    Hours,
    Series,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchMilestone {
    pub id: String,
    pub category: MilestoneCategory,
    pub threshold: i64,
    pub current_value: i64,
    pub achieved: bool,
    pub achieved_at: Option<String>,
}
