-- Pagination handlers for OmniFocus AppleScript integration
-- Provides reusable pagination state and range checking

-- Initialize pagination state for a query
-- Returns a record with initial values
on initPagination()
	return {output:"", isFirst:true, totalCount:0, returnedCount:0, currentIndex:0}
end initPagination

-- Check if current index is within the pagination range
-- Returns true if the item should be included in results
on isInRange(currentIndex, offset, limitVal, returnedCount)
	return (currentIndex >= offset) and (returnedCount < limitVal)
end isInRange

-- Get the separator to insert before an item
-- Returns "," if not the first item, empty string otherwise
on getSeparator(isFirst)
	if isFirst then
		return ""
	else
		return ","
	end if
end getSeparator

-- Build the pagination metadata JSON suffix
-- Takes totalCount, returnedCount, offset, and limit
-- Returns the closing part of the pagination JSON response
on buildPaginationSuffix(totalCount, returnedCount, offset, limitVal)
	set hasMore to (totalCount > (offset + returnedCount))
	return "]," & ¬
		"\"totalCount\": " & totalCount & "," & ¬
		"\"returnedCount\": " & returnedCount & "," & ¬
		"\"hasMore\": " & hasMore & "," & ¬
		"\"offset\": " & offset & "," & ¬
		"\"limit\": " & limitVal & ¬
		"}"
end buildPaginationSuffix
