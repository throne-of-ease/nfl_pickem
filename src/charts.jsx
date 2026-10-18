export * from './chartsBase.jsx'
import React from 'react'
import { TeamModelRelativeChart as BaseTeamModelRelativeChart } from './chartsBase.jsx'
import PickCorrelationMatrix from './pickCorrelation.jsx'

export function TeamModelRelativeChart(props) {
  return <>
    <BaseTeamModelRelativeChart {...props} />
    <PickCorrelationMatrix players={props.players} gamesByPool={props.gamesByPool} picksByUser={props.picksByUser} poolKeys={props.poolKeys} />
  </>
}
