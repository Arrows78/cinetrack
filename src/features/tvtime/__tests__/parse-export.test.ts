import { describe, expect, it } from "vitest";
import { parseCsv } from "../csv";
import { detectFileKind, emptyExport, normalizeExport, parseTvTimeFile, parseTvTimeFiles } from "../parse-export";

const RECORDS_V2 = `s_id,runtime,series_name,episode_number,user_id,gsi,created_at,key,season_number,s_no,ep_no,ep_id,episode_id,updated_at,ep_watch_count,movie_watch_count,total_movies_runtime,total_series_runtime,series_follow_count,is_archived,is_for_later,is_followed,uuid,followed_at,most_recent_ep_watched,is_unitary,bulk_type,is_special,rewatch_count
349310,3660,Bodyguard (2018),6,1,watch-episode-1,2023-11-04 15:30:38,watch-episode-aaa,1,1,6,6733513,6733513,2023-11-04 15:30:38,,,,,,,,,,,,true,,,
349310,3660,Bodyguard (2018),6,1,watch-episode-2,2023-12-01 10:00:00,watch-episode-bbb,1,1,6,6733513,6733513,2023-12-01 10:00:00,,,,,,,,,,,,true,,,
73800,,Desperate Housewives,,1,,2015-09-13 15:34:44,user-series-ccc,,,,,,2015-09-13 15:34:44,,,,,,false,false,true,ccc,,,,,,
362696,3420,The Witcher,5,1,watch-episode-3,2025-11-29 18:13:36,rewatch-episode-ddd,4,4,5,11355515,11355515,,,,,,,,,,,,,,,,`;

const RECORDS_V1 = `user_id,series_id,watch_count,uuid,updated_at,created_at,type-uuid-n,type,series_name,watches,follow_date_range_key,entity_type,rewatch_count,movie_name,release_date,runtime,release_date_range_key,alpha_range_key,episode_number,episode_id,season_number,series_uuid,watch_date,watched_episode_range_key,total_series_runtime,total_movies_runtime,unitarian,watch_date_range_key,country,bulk_type
1,,,aaa,2019-09-08 17:24:29,2019-09-08 17:24:29,watch-aaa-0,watch,,,,movie,0,Fury,2014-10-15 00:00:00,8040,,,,,,,,,,,,,GB,
1,,,bbb,2023-09-04 21:53:54,2023-09-04 21:53:54,towatch-bbb,towatch,,,,movie,,The Batman,2022-03-03 00:00:00,10560,,,,,,,,,,,,,,
1,79349,96,ccc,2021-07-06 08:29:47,2021-07-06 08:29:40,count-ccc,count-watch-episode-series,Dexter,,,,,,,,,,,,,,,,,,,,,`;

const FOLLOWED = `user_id,active,notification_type,notification_offset,tv_show_id,created_at,updated_at,diffusion,folder_id,archived,tv_show_name
1,1,2,1440,70329,2020-08-14 20:13:54,2020-08-14 20:13:54,original,,0,My Wife and Kids`;

const SPECIAL = `created_at,updated_at,tv_show_name,user_id,tv_show_id,status
2021-06-06 17:53:33,2021-06-06 17:53:33,Parks and Recreation,1,84912,for_later`;

describe("parseCsv", () => {
  it("handles quoted fields with commas and escaped quotes", () => {
    const rows = parseCsv('a,b\n"x, y","he said ""hi"""\n');
    expect(rows).toEqual([{ a: "x, y", b: 'he said "hi"' }]);
  });

  it("skips fully empty lines", () => {
    expect(parseCsv("a,b\n\n1,2\n")).toEqual([{ a: "1", b: "2" }]);
  });
});

describe("detectFileKind", () => {
  it("identifies each export file by header", () => {
    expect(detectFileKind(RECORDS_V2)).toBe("records-v2");
    expect(detectFileKind(RECORDS_V1)).toBe("records-v1");
    expect(detectFileKind(FOLLOWED)).toBe("followed");
    expect(detectFileKind(SPECIAL)).toBe("special-status");
    expect(detectFileKind("foo,bar\n1,2")).toBe("unknown");
  });
});

describe("parseTvTimeFile + normalizeExport", () => {
  it("extracts watched episodes with UTC dates and runtime minutes", () => {
    const data = emptyExport();
    parseTvTimeFile(RECORDS_V2, data);
    const normalized = normalizeExport(data);

    // 2 watch rows for the same episode dedupe to the earliest; the
    // rewatch row and the user-series row map to 1 more and 0 entries.
    expect(normalized.episodes).toHaveLength(2);
    const bodyguard = normalized.episodes.find((episode) => episode.seriesName === "Bodyguard (2018)");
    expect(bodyguard).toMatchObject({
      seasonNumber: 1,
      episodeNumber: 6,
      watchedAt: "2023-11-04T15:30:38.000Z",
      runtimeMinutes: 61,
    });
  });

  it("extracts watched movies and the movie watchlist from v1 records", () => {
    const data = emptyExport();
    parseTvTimeFile(RECORDS_V1, data);
    const normalized = normalizeExport(data);

    expect(normalized.movies).toEqual([
      { title: "Fury", year: 2014, watchedAt: "2019-09-08T17:24:29.000Z", runtimeMinutes: 134 },
    ]);
    expect(normalized.watchlist).toEqual([{ title: "The Batman", mediaType: "movie", year: 2022 }]);
  });

  it("collects TVDB ids and for_later series", () => {
    const data = emptyExport();
    parseTvTimeFile(FOLLOWED, data);
    parseTvTimeFile(SPECIAL, data);

    expect(data.tvdbIdsByName.get("my wife and kids")).toBe(70329);
    expect(data.watchlist).toEqual([{ title: "Parks and Recreation", mediaType: "series", year: null }]);
  });

  it("counts (rather than silently drops or backdates) rows missing a watch date", () => {
    const recordsV2WithBlankDate = RECORDS_V2.replace(
      "349310,3660,Bodyguard (2018),6,1,watch-episode-1,2023-11-04 15:30:38,watch-episode-aaa,1,1,6,6733513,6733513,2023-11-04 15:30:38,,,,,,,,,,,,true,,,",
      "349310,3660,Bodyguard (2018),6,1,watch-episode-1,,watch-episode-aaa,1,1,6,6733513,6733513,2023-11-04 15:30:38,,,,,,,,,,,,true,,,"
    );
    const recordsV1WithBlankDate = RECORDS_V1.replace(
      "1,,,aaa,2019-09-08 17:24:29,2019-09-08 17:24:29,watch-aaa-0,watch,,,,movie,0,Fury,2014-10-15 00:00:00,8040,,,,,,,,,,,,,GB,",
      "1,,,aaa,2019-09-08 17:24:29,,watch-aaa-0,watch,,,,movie,0,Fury,2014-10-15 00:00:00,8040,,,,,,,,,,,,,GB,"
    );
    const data = emptyExport();
    parseTvTimeFile(recordsV2WithBlankDate, data);
    parseTvTimeFile(recordsV1WithBlankDate, data);

    // The undated Bodyguard row is dropped (its dated duplicate still
    // imports); Fury has no dated row left at all.
    expect(data.skippedRows).toEqual({ episodes: 1, movies: 1 });
    const normalized = normalizeExport(data);
    expect(normalized.episodes.find((episode) => episode.seriesName === "Bodyguard (2018)")).toMatchObject({
      watchedAt: "2023-12-01T10:00:00.000Z",
    });
    expect(normalized.movies).toEqual([]);
  });
});

describe("parseTvTimeFiles", () => {
  it("parses every recognized file and lists the ones it couldn't identify", () => {
    const { data, unrecognizedFiles } = parseTvTimeFiles([
      { name: "tracking-prod-records-v2.csv", text: RECORDS_V2 },
      { name: "followed_tv_show.csv", text: FOLLOWED },
      { name: "account_info.csv", text: "email,created_at\nme@example.com,2020-01-01" },
    ]);

    expect(data.episodes.length).toBeGreaterThan(0);
    expect(data.tvdbIdsByName.get("my wife and kids")).toBe(70329);
    expect(unrecognizedFiles).toEqual(["account_info.csv"]);
  });
});
