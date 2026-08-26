#library(espnscrapeR)
library(data.table)


#refresh_current_week  = 0
#sel_week              = 2

#sel_week              = 7
prepare_list_of_games = 0
extract_all_picks     = 0
refresh_current_week  = 1
all_picks_file        = "all_picks_gh.gz"
final_file            = "dt_picks_gh.gz"
list_of_games_file    = "list_of_games_gh.gz"

season                = 2025
season_origin         = "2025-09-04"
sel_week              = ceiling((as.IDate(Sys.Date())-as.IDate(season_origin)+1)/7)

# Functions ---------------------------------------------------------------
# --- Function to scrape ESPN Pick'em picks for a given URL and week ---
scrape_picks <- function(url_link, sel_week, current_week=T, sleep_time = 5, print=T) {
    
    library(chromote)
    library(xml2)
    library(rvest)
    library(data.table)
    
    # start browser session
    b <- ChromoteSession$new()
    on.exit(b$close(), add = TRUE)  # ensure closing
    
    b$Page$navigate(url_link)
    Sys.sleep(sleep_time)  # wait for JS
    
    # --- Click on given week ---
    #click_sel <- "[class='EntryScoringPeriodItem-label']"
    click_sel <- ".EntryScoringPeriodItem-label"
    nodes <- b$DOM$querySelectorAll(
        nodeId = b$DOM$getDocument()$root$nodeId,
        selector = click_sel
    )
    if (length(nodes$nodeIds) < sel_week) {
        warning("Requested week not available for this URL")
        return(NULL)
    }
    
    if(current_week==F){
        node_id <- nodes$nodeIds[[sel_week]]
        obj <- b$DOM$resolveNode(nodeId = node_id)
        b$Runtime$callFunctionOn(
            functionDeclaration = "function() { this.click(); }",
            objectId = obj$object$objectId
        )
        Sys.sleep(sleep_time)
    }
    
    # --- Get rendered HTML ---
    html <- b$DOM$getDocument()
    node_html <- b$DOM$getOuterHTML(nodeId = html$root$nodeId)
    doc <- read_html(node_html$outerHTML)
    
    # --- Extract entry name ---
    entry_node <- xml_find_first(doc, "//*[contains(@class,'EntryCardTitle-entryName')]")
    entry_name <- if (!is.na(entry_node)) trimws(html_text(entry_node)) else NA_character_
    
    # --- Extract week from HTML ---
    raw_text <- as.character(doc)
    week_match <- regexpr("Week[[:space:]]+([0-9]+)", raw_text, ignore.case = TRUE)
    week <- if (week_match > 0) as.integer(sub(".*Week[[:space:]]+([0-9]+).*", "\\1", regmatches(raw_text, week_match))) else NA_integer_
    
    # --- Extract matchups and picks ---
    all_cards <- xml_find_all(doc, "//div[contains(@class,'ConfidenceProposition')]")
    cards <- all_cards[sapply(all_cards, function(x) {
        length(xml_find_all(x, ".//div[contains(@class,'OutcomeDetails-title')]//div")) >= 2
    })]
    
    print(paste0("Extracting picks week ",week ," of ",entry_name, " (",length(cards)/2,")"))
    
    rows <- list()
    for (i in seq_along(cards)) {
        node <- cards[[i]]
        team_nodes <- xml_find_all(node, ".//div[contains(@class,'OutcomeDetails-title')]//div")
        teams <- trimws(html_text(team_nodes))
        
        matchup <- paste(teams[1:2], collapse = " vs ")
        home_team <- teams[2]
        away_team <- teams[1]
        
        picked_node <- xml_find_first(node, ".//div[contains(@class,'Outcome--selected')]//div[contains(@class,'OutcomeDetails-title')]//div")
        picked_team <- if (!is.na(picked_node)) trimws(html_text(picked_node)) else NA_character_
        
        conf_node <- xml_find_first(node, ".//div[contains(@class,'ConfidenceProposition-confidenceScore')]//span[contains(@class,'ConfidenceValue-value')]")
        confidence <- if (!is.na(conf_node)) as.integer(html_text(conf_node)) else NA_integer_
        
        rows[[i]] <- list(matchup = matchup,
                          picked_team = picked_team,
                          confidence = confidence,
                          home_team  = home_team,
                          away_team  = away_team)
    }
    
    results <- rbindlist(rows)
    results[, id := 1:.N, by = matchup]
    results <- results[id == 1][, id := NULL]
    
    
    
    results[, `:=`(week = week, entry_name = entry_name, date_extracted = Sys.time())]
    
    teams = data.table::data.table(
        team_id = c(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L, 9L, 10L, 11L, 12L, 13L, 14L, 15L, 16L, 17L, 18L, 19L, 20L, 21L, 22L, 23L, 24L, 25L, 26L, 27L, 28L, 29L, 30L, 33L, 34L),
        
        team_name = c("Falcons", "Bills", "Bears", "Bengals", "Browns", "Cowboys", "Broncos", "Lions", "Packers", "Titans", "Colts", "Chiefs", "Raiders", "Rams", "Dolphins", "Vikings", "Patriots", "Saints", "Giants", "Jets", "Eagles", "Cardinals", "Steelers", "Chargers", "49ers", "Seahawks", "Buccaneers", "Commanders", "Panthers", "Jaguars", "Ravens", "Texans"),
        
        team_nickname = c("Falcons", "Bills", "Bears", "Bengals", "Browns", "Cowboys", "Broncos", "Lions", "Packers", "Titans", "Colts", "Chiefs", "Raiders", "Rams", "Dolphins", "Vikings", "Patriots", "Saints", "Giants", "Jets", "Eagles", "Cardinals", "Steelers", "Chargers", "49ers", "Seahawks", "Buccaneers", "Commanders", "Panthers", "Jaguars", "Ravens", "Texans"),
        
        team_abb = c("ATL", "BUF", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "TEN", "IND", "KC", "LV", "LAR", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "ARI", "PIT", "LAC", "SF", "SEA", "TB", "WSH", "CAR", "JAX", "BAL", "HOU"),
        
        team_full_name = c("Atlanta Falcons", "Buffalo Bills", "Chicago Bears", "Cincinnati Bengals", "Cleveland Browns", "Dallas Cowboys", "Denver Broncos", "Detroit Lions", "Green Bay Packers", "Tennessee Titans", "Indianapolis Colts", "Kansas City Chiefs", "Las Vegas Raiders", "Los Angeles Rams", "Miami Dolphins", "Minnesota Vikings", "New England Patriots", "New Orleans Saints", "New York Giants", "New York Jets", "Philadelphia Eagles", "Arizona Cardinals", "Pittsburgh Steelers", "Los Angeles Chargers", "San Francisco 49ers", "Seattle Seahawks", "Tampa Bay Buccaneers", "Washington Commanders", "Carolina Panthers", "Jacksonville Jaguars", "Baltimore Ravens", "Houston Texans"),
        
        team_color = c("#a71930", "#00338d", "#0b1c3a", "#fb4f14", "#472a08", "#002a5c", "#0a2343", "#0076b6", "#204e32", "#4b92db", "#003b75", "#e31837", "#000000", "#003594", "#008e97", "#4f2683", "#002a5c", "#d3bc8d", "#003c7f", "#115740", "#06424d", "#a40227", "#000000", "#0080c6", "#aa0000", "#002a5c", "#bd1c36", "#5a1414", "#0085ca", "#007487", "#29126f", "#00143f"),
        
        team_alt_color = c("#000000", "#d50a0a", "#e64100", "#000000", "#ff3c00", "#b0b7bc", "#fc4c02", "#bbbbbb", "#ffb612", "#002a5c", "#ffffff", "#ffb612", "#a5acaf", "#ffd100", "#fc4c02", "#ffc62f", "#c60c30", "#000000", "#c9243f", "#ffffff", "#000000", "#ffffff", "#ffb612", "#ffc20e", "#b3995d", "#69be28", "#3e3a35", "#ffb612", "#000000", "#d7a22a", "#000000", "#c41230"),
        
        logo = c("https://a.espncdn.com/i/teamlogos/nfl/500/atl.png", "https://a.espncdn.com/i/teamlogos/nfl/500/buf.png", "https://a.espncdn.com/i/teamlogos/nfl/500/chi.png", "https://a.espncdn.com/i/teamlogos/nfl/500/cin.png", "https://a.espncdn.com/i/teamlogos/nfl/500/cle.png", "https://a.espncdn.com/i/teamlogos/nfl/500/dal.png", "https://a.espncdn.com/i/teamlogos/nfl/500/den.png", "https://a.espncdn.com/i/teamlogos/nfl/500/det.png", "https://a.espncdn.com/i/teamlogos/nfl/500/gb.png", "https://a.espncdn.com/i/teamlogos/nfl/500/ten.png", "https://a.espncdn.com/i/teamlogos/nfl/500/ind.png", "https://a.espncdn.com/i/teamlogos/nfl/500/kc.png", "https://a.espncdn.com/i/teamlogos/nfl/500/lv.png", "https://a.espncdn.com/i/teamlogos/nfl/500/lar.png", "https://a.espncdn.com/i/teamlogos/nfl/500/mia.png", "https://a.espncdn.com/i/teamlogos/nfl/500/min.png", "https://a.espncdn.com/i/teamlogos/nfl/500/ne.png", "https://a.espncdn.com/i/teamlogos/nfl/500/no.png", "https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png", "https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png", "https://a.espncdn.com/i/teamlogos/nfl/500/phi.png", "https://a.espncdn.com/i/teamlogos/nfl/500/ari.png", "https://a.espncdn.com/i/teamlogos/nfl/500/pit.png", "https://a.espncdn.com/i/teamlogos/nfl/500/lac.png", "https://a.espncdn.com/i/teamlogos/nfl/500/sf.png", "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png", "https://a.espncdn.com/i/teamlogos/nfl/500/tb.png", "https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png", "https://a.espncdn.com/i/teamlogos/nfl/500/car.png", "https://a.espncdn.com/i/teamlogos/nfl/500/jax.png", "https://a.espncdn.com/i/teamlogos/nfl/500/bal.png", "https://a.espncdn.com/i/teamlogos/nfl/500/hou.png")
    )
    
    
    results = merge(results,teams[,.(home_team=team_nickname,home_team_abb=team_abb)],by="home_team")
    results = merge(results,teams[,.(away_team=team_nickname,away_team_abb=team_abb)],by="away_team")
    results = merge(results,teams[,.(picked_team=team_nickname,picked_abb=team_abb)],by="picked_team")
    
    results[,name:=fcase(entry_name=="NFLStressTest2026","Jirka P",
                         entry_name=="Hichoose","Honza",
                         entry_name=="Istvanutca","Jirka L",
                         entry_name=="throneofease","Marek")]
    results[,game_name:=paste0(away_team_abb,"@",home_team_abb)]
    results[,picked:=picked_abb]
    
    if (print) print(results[,.(week,name,game_name,picked,confidence,date_extracted)])
    
    return(results[,.(week,name,game_name,picked,confidence,date_extracted)])
}

# defined here not to install espnscraper
library(data.table)
library(httr)
library(glue)
library(jsonlite)

get_nfl_schedule <- function(season){
    
    message(glue::glue("Returning data for {season}!"))
    
    max_year <- substr(Sys.Date(), 1, 4)
    
    if(!(as.integer(substr(season, 1, 4)) %in% c(1969:max_year))){
        message(paste("Error: Season must be between 1969 and", max_year))
    }
    
    # year > 1969
    season <- as.character(season)
    if(nchar(season) > 4){
        season_dates <- season
    } else {
        season_dates <- glue::glue("{season}0101-{season}1231")
    }
    
    raw_url <- "http://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
    
    raw_get <- httr::GET(
        raw_url,
        query = list(
            limit = 1000,
            dates = season_dates
        )
    )
    
    httr::stop_for_status(raw_get)
    
    raw_sched <- httr::content(raw_get)
    
    # Convert list to data.table
    events <- raw_sched[["events"]]
    
    # Extract basic fields
    nfl_data <- data.table::rbindlist(lapply(events, function(event) {
        comp <- event$competitions[[1]]
        
        # Extract home team (index 1)
        home_team <- comp$competitors[[1]]
        # Extract away team (index 2)
        away_team <- comp$competitors[[2]]
        
        data.table::data.table(
            matchup = event$name,
            matchup_short = event$shortName,
            game_id = comp$id,
            game_uid = comp$uid,
            game_date = comp$date,
            status_name = comp$status$type$name,
            season = comp$season$year,
            slug = comp$season$slug,
            
            # Home team
            home_team_name = home_team$team$name,
            home_team_logo = home_team$team$logo,
            home_team_abb = home_team$team$abbreviation,
            home_team_id = home_team$team$id,
            home_team_location = home_team$team$location,
            home_team_full = home_team$team$displayName,
            home_team_color = home_team$team$color,
            home_score = as.integer(home_team$score),
            home_win = as.integer(home_team$winner %||% NA),
            home_record = if(length(home_team$records) > 0) home_team$records[[1]]$summary else NA_character_,
            
            # Away team
            away_team_name = away_team$team$name,
            away_team_logo = away_team$team$logo,
            away_team_abb = away_team$team$abbreviation,
            away_team_id = away_team$team$id,
            away_team_location = away_team$team$location,
            away_team_full = away_team$team$displayName,
            away_team_color = away_team$team$color,
            away_score = as.integer(away_team$score),
            away_win = as.integer(away_team$winner %||% NA),
            away_record = if(length(away_team$records) > 0) away_team$records[[1]]$summary else NA_character_,
            
            # Store leaders and venue for later extraction
            has_leaders = !is.null(comp$leaders),
            leaders = list(comp$leaders),
            has_venue = !is.null(comp$venue),
            venue = list(comp$venue),
            has_broadcasts = !is.null(comp$broadcasts),
            broadcasts = list(comp$broadcasts)
        )
    }), fill = TRUE)
    
    # Extract leader stats if available
    if(any(nfl_data$has_leaders, na.rm = TRUE)) {
        leader_data <- data.table::rbindlist(lapply(seq_len(nrow(nfl_data)), function(i) {
            if(nfl_data$has_leaders[i]) {
                leaders <- nfl_data$leaders[[i]]
                
                # Passing leader
                pass_leader <- if(length(leaders) >= 1 && length(leaders[[1]]$leaders) > 0) leaders[[1]]$leaders[[1]] else list()
                # Rushing leader
                rush_leader <- if(length(leaders) >= 2 && length(leaders[[2]]$leaders) > 0) leaders[[2]]$leaders[[1]] else list()
                # Receiving leader
                rec_leader <- if(length(leaders) >= 3 && length(leaders[[3]]$leaders) > 0) leaders[[3]]$leaders[[1]] else list()
                
                data.table::data.table(
                    pass_leader_yards = pass_leader$value %||% NA_real_,
                    pass_leader_stat = pass_leader$displayValue %||% NA_character_,
                    pass_leader_name = pass_leader$athlete$displayName %||% NA_character_,
                    pass_leader_shortname = pass_leader$athlete$shortName %||% NA_character_,
                    pass_leader_headshot = pass_leader$athlete$headshot %||% NA_character_,
                    pass_leader_team_id = pass_leader$team$id %||% NA_character_,
                    pass_leader_pos = pass_leader$athlete$position$abbreviation %||% NA_character_,
                    
                    rush_leader_yards = rush_leader$value %||% NA_real_,
                    rush_leader_stat = rush_leader$displayValue %||% NA_character_,
                    rush_leader_name = rush_leader$athlete$displayName %||% NA_character_,
                    rush_leader_shortname = rush_leader$athlete$shortName %||% NA_character_,
                    rush_leader_headshot = rush_leader$athlete$headshot %||% NA_character_,
                    rush_leader_team_id = rush_leader$team$id %||% NA_character_,
                    rush_leader_pos = rush_leader$athlete$position$abbreviation %||% NA_character_,
                    
                    rec_leader_yards = rec_leader$value %||% NA_real_,
                    rec_leader_stat = rec_leader$displayValue %||% NA_character_,
                    rec_leader_name = rec_leader$athlete$displayName %||% NA_character_,
                    rec_leader_shortname = rec_leader$athlete$shortName %||% NA_character_,
                    rec_leader_headshot = rec_leader$athlete$headshot %||% NA_character_,
                    rec_leader_team_id = rec_leader$team$id %||% NA_character_,
                    rec_leader_pos = rec_leader$athlete$position$abbreviation %||% NA_character_
                )
            } else {
                data.table::data.table(
                    pass_leader_yards = NA_real_, pass_leader_stat = NA_character_,
                    pass_leader_name = NA_character_, pass_leader_shortname = NA_character_,
                    pass_leader_headshot = NA_character_, pass_leader_team_id = NA_character_,
                    pass_leader_pos = NA_character_, rush_leader_yards = NA_real_,
                    rush_leader_stat = NA_character_, rush_leader_name = NA_character_,
                    rush_leader_shortname = NA_character_, rush_leader_headshot = NA_character_,
                    rush_leader_team_id = NA_character_, rush_leader_pos = NA_character_,
                    rec_leader_yards = NA_real_, rec_leader_stat = NA_character_,
                    rec_leader_name = NA_character_, rec_leader_shortname = NA_character_,
                    rec_leader_headshot = NA_character_, rec_leader_team_id = NA_character_,
                    rec_leader_pos = NA_character_
                )
            }
        }), fill = TRUE)
        
        nfl_data <- cbind(nfl_data, leader_data)
    }
    
    # Extract venue information if available
    if(any(nfl_data$has_venue, na.rm = TRUE)) {
        venue_data <- data.table::rbindlist(lapply(seq_len(nrow(nfl_data)), function(i) {
            if(nfl_data$has_venue[i]) {
                venue <- nfl_data$venue[[i]]
                data.table::data.table(
                    venue_id = venue$id %||% NA_character_,
                    venue_name = venue$fullName %||% NA_character_,
                    venue_city = venue$address$city %||% NA_character_,
                    venue_state = venue$address$state %||% NA_character_,
                    capacity = venue$capacity %||% NA_integer_,
                    indoor = venue$indoor %||% NA
                )
            } else {
                data.table::data.table(
                    venue_id = NA_character_, venue_name = NA_character_,
                    venue_city = NA_character_, venue_state = NA_character_,
                    capacity = NA_integer_, indoor = NA
                )
            }
        }), fill = TRUE)
        
        nfl_data <- cbind(nfl_data, venue_data)
    }
    
    # Extract broadcast information if available
    if(any(nfl_data$has_broadcasts, na.rm = TRUE)) {
        broadcast_data <- data.table::rbindlist(lapply(seq_len(nrow(nfl_data)), function(i) {
            if(nfl_data$has_broadcasts[i]) {
                broadcasts <- nfl_data$broadcasts[[i]]
                if(length(broadcasts) > 0) {
                    data.table::data.table(
                        broadcast_market = broadcasts[[1]]$market %||% NA_character_,
                        broadcast_name = if(length(broadcasts[[1]]$names) > 0) broadcasts[[1]]$names[[1]] else NA_character_
                    )
                } else {
                    data.table::data.table(broadcast_market = NA_character_, broadcast_name = NA_character_)
                }
            } else {
                data.table::data.table(broadcast_market = NA_character_, broadcast_name = NA_character_)
            }
        }), fill = TRUE)
        
        nfl_data <- cbind(nfl_data, broadcast_data)
    }
    
    # Remove temporary columns
    nfl_data[, c("has_leaders", "leaders", "has_venue", "venue", "has_broadcasts", "broadcasts") := NULL]
    nfl_data[,startDate:=game_date]
    return(nfl_data)
}


# 1. List of games with ids --------------------------------------------------
if(prepare_list_of_games){

# List of games with game_ids

games = data.table(get_nfl_schedule(season))
games = games[startDate>as.Date(season_origin)]

if (year(Sys.Date())==season+1) {
    games2 = data.table(get_nfl_schedule(season+1))  # Add january games
    games2 = games2[month(startDate)<4]
    games = rbindlist(list(games,games2),fill=T)
}



games=games[,.(away_team_abb,home_team_abb,status_name,game_id,game_date)]
games[,game_id:=as.numeric(game_id)]
games[,date:=as.IDate(game_date)]
games[,date_dif:=date-as.IDate(season_origin)]
games[, week:=ceiling((date_dif+1)/7)]
games[,game_name:=paste0(away_team_abb,"@",home_team_abb)]
games[,game_date:=NULL][,date_dif:=NULL]
games=games[,.(week,game_name,game_id,date)]
fwrite(games,list_of_games_file)
}
if (prepare_list_of_games==0) games=fread(list_of_games_file)

# 2. Load our picks ----------------------------------------------------------

url_list = c("https://fantasy.espn.com/games/nfl-pigskin-pickem-2025/picks?id=85548a30-8904-11f0-9e4c-dd1188235fae",
             "https://fantasy.espn.com/games/nfl-pigskin-pickem-2025/picks?id=908d7ac0-88b3-11f0-b1ab-011cec36886d",
             "https://fantasy.espn.com/games/nfl-pigskin-pickem-2025/picks?id=a300a820-872e-11f0-add8-416dcf432d0a",
             "https://fantasy.espn.com/games/nfl-pigskin-pickem-2025/picks?id=6327f790-8845-11f0-b1ab-011cec36886d")

# 2a. previous weeks -----------------------------------------------------
if(extract_all_picks){
picks = data.table()
for (url in url_list){
    for (week in 1:sel_week){
       temp = scrape_picks(url, sel_week=week,current_week = F)
       picks = rbindlist(list(picks,temp),fill=T,use.names=T)
    }
}
fwrite(picks,all_picks_file)
}
if (extract_all_picks==0) picks = fread(all_picks_file)


# 2b. refresh_current_week -----------------------------------------------------
if (refresh_current_week){
    picks_new = data.table()
    for (url in url_list){
            temp_new = scrape_picks(url, sel_week=sel_week,current_week = T)
            picks_new = rbindlist(list(picks_new,temp_new),fill=T,use.names=T)
    }


picks_all = rbindlist(list(picks,picks_new),use.names = T,fill=T)

# remove duplicated ,if any
picks_all[order(date_extracted),latest:=.N:1,by=.(name,week,game_name)]
#print(picks_all[,.N,by=.(name,week)][order(week,name,N)])

picks_all = picks_all[latest==1]

print(picks_all[,.N,by=.(name,week)][order(week,name,N)])

fwrite(picks_all,all_picks_file)
picks = copy(picks_all)
}

games = rbindlist(
    lapply(c("Marek", "Honza", "Jirka L","Jirka P"), 
           function(nm) { tmp = copy(games); tmp[, name := nm]; tmp }),
    use.names = TRUE, fill = TRUE
)


# 3. merge with game ids and convert to right format for loading b --------
dt_picks = merge(games,picks[,.(week,game_name,name,
                     picked,confidence)],by=c("week","game_name","name"),all.x=T)


# Quick fix for the missing pick ------------------------------------------


dt_picks[!is.na(picked),n:=.N,by=game_id][n>=1&n<4]
dt_picks[,n:=mean(n,na.rm=T),by=game_id]
dt_picks[n>=1&n<4&is.na(picked),picked:='NFL']
dt_picks[n>=1&n<4&order(game_id)&is.na(confidence),confidence:=1:.N,by=.(name,week)]
dt_picks[,n:=NULL]


# save final
fwrite(dt_picks,final_file)
rm(games,picks,picks_all,picks_new,temp_new)

writeLines(jsonlite::toJSON(dt_picks, pretty = FALSE, auto_unbox = TRUE), "picks.json")
