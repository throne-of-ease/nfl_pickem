library(data.table)
library(jsonlite)
fpi=data.table(espnscrapeR::scrape_fpi(season=2025))
#teams=data.table(espnscrapeR::get_nfl_teams())
#teams=teams[,.(team_abb,team_full_name)]
#fpiq = merge(fpi,teams,by.x= 'team',by.y='team_full_name' )
#fpiq = fpiq[,.(team_abb,fpi)]


# Convert to JSON
json_output <- toJSON(fpi, pretty = TRUE)

# Save to file
write(json_output, "data/fpi_data.json")

print("FPI data successfully downloaded and saved to data/fpi_data.json")
